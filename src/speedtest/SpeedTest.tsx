import { useEffect, useState } from 'preact/hooks';
import { Button, Card, ProgressBar, type Progress } from '../ui';
import { getDeviceInfo, type DeviceInfo } from './device';
import type { LlmResult } from './llm';
import type { SttResult } from './stt';
import { TEXT_MODELS, resolveModelId } from './models';
import { formatReport, llmVerdict, sttVerdict, type Verdict } from './report';

export function SpeedTest() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [model, setModel] = useState(TEXT_MODELS[0].id);
  const [llm, setLlm] = useState<LlmResult>();
  const [stt, setStt] = useState<SttResult>();
  const [llmProgress, setLlmProgress] = useState<Progress>(null);
  const [sttProgress, setSttProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDeviceInfo().then(setDevice);
  }, []);

  const busy = llmProgress !== null || sttProgress !== null;

  async function testLlm() {
    if (!device) return;
    setError(null);
    // Ask the browser not to evict the model when disk space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    setLlmProgress({ fraction: 0, text: 'Starting…' });
    try {
      // Loaded on demand so the app itself opens instantly.
      const { runLlmTest } = await import('./llm');
      setLlm(await runLlmTest(resolveModelId(model, device.shaderF16), (fraction, text) => setLlmProgress({ fraction, text })));
    } catch (err) {
      setError(`Text model: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLlmProgress(null);
    }
  }

  async function testStt() {
    setError(null);
    setSttProgress({ fraction: 0, text: 'Starting…' });
    try {
      const { runSttTest } = await import('./stt');
      setStt(await runSttTest((fraction, text) => setSttProgress({ fraction, text })));
    } catch (err) {
      setError(`Dictation: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSttProgress(null);
    }
  }

  async function copyReport() {
    if (!device) return;
    await navigator.clipboard.writeText(formatReport(device, llm, stt));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Device speed test</h2>
        <p class="text-sm text-muted">
          Checks if this computer can run the assistant's AI locally. The first run downloads the models once; later runs use the saved copy. No data leaves this computer.
        </p>
      </div>

      <Card title="1. This computer">
        {!device ? (
          <p class="text-sm text-muted">Checking…</p>
        ) : (
          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Stat label="GPU acceleration" value={device.webgpu ? 'Yes' : 'No'} verdict={device.webgpu ? 'good' : 'slow'} />
            <Stat label="RAM" value={device.memoryGB ? `${device.memoryGB}+ GB` : 'Unknown'} verdict={device.memoryGB == null ? undefined : device.memoryGB >= 8 ? 'good' : 'ok'} />
            <Stat label="CPU cores" value={String(device.cores ?? '?')} />
            <Stat label="Free storage" value={device.storageFreeGB != null ? `${device.storageFreeGB} GB` : '?'} verdict={device.storageFreeGB == null ? undefined : device.storageFreeGB >= 3 ? 'good' : 'slow'} />
            <Stat label="GPU" value={device.gpu ?? '-'} />
            <Stat label="Chrome built-in AI" value={device.builtInAI} />
          </dl>
        )}
        {device && !device.webgpu && (
          <p class="mt-3 rounded-md bg-red-50 p-2 text-sm text-bad">
            This browser has no WebGPU. Use an up-to-date Chrome or Edge. The text model can't run without it.
          </p>
        )}
      </Card>

      <Card title="2. Writing assistant (text model)">
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
            value={model}
            disabled={busy}
            onChange={(e) => setModel(e.currentTarget.value)}
          >
            {TEXT_MODELS.map((m) => (
              <option value={m.id}>{m.label} · ~{m.downloadMB} MB</option>
            ))}
          </select>
          <Button onClick={testLlm} disabled={busy || !device?.webgpu}>Run test</Button>
        </div>
        <ProgressBar progress={llmProgress} />
        {llm && (
          <div class="mt-3 space-y-2">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Stat label="Speed" value={`${llm.tokensPerSecond.toFixed(1)} tokens/s`} verdict={llmVerdict(llm.tokensPerSecond)} />
              <Stat label="First word" value={`${llm.firstTokenSeconds.toFixed(1)} s`} />
              <Stat label={llm.wasCached ? 'Load (saved copy)' : 'Download + load'} value={`${llm.loadSeconds.toFixed(0)} s`} />
              <Stat label="Model" value={llm.modelId.replace(/-q4f(16|32)_1-MLC$/, '')} />
            </dl>
            <details class="text-sm">
              <summary class="cursor-pointer text-muted">Sample output</summary>
              <pre class="mt-1 whitespace-pre-wrap rounded-md bg-canvas p-2 font-sans">{llm.output}</pre>
            </details>
          </div>
        )}
      </Card>

      <Card title="3. Dictation (speech model)">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted">Moonshine Tiny · ~60 MB · transcribes an 11 s sample clip</span>
          <Button onClick={testStt} disabled={busy}>Run test</Button>
        </div>
        <ProgressBar progress={sttProgress} />
        {stt && (
          <div class="mt-3 space-y-2">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <Stat label="Transcribe time" value={`${stt.transcribeSeconds.toFixed(1)} s for ${stt.audioSeconds.toFixed(0)} s audio`} verdict={sttVerdict(stt)} />
              <Stat label="Load" value={`${stt.loadSeconds.toFixed(1)} s`} />
            </dl>
            <p class="rounded-md bg-canvas p-2 text-sm">“{stt.text}”</p>
          </div>
        )}
      </Card>

      {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}

      <div class="flex items-center gap-3">
        <Button onClick={copyReport} disabled={!device} variant="secondary">
          {copied ? 'Copied ✓' : 'Copy results'}
        </Button>
        <span class="text-xs text-muted">Paste the results to share them. They contain only device specs and speeds.</span>
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: 'text-good',
  ok: 'text-warn',
  slow: 'text-bad',
};

function Stat({ label, value, verdict }: { label: string; value: string; verdict?: Verdict }) {
  return (
    <div class="min-w-0">
      <dt class="text-xs text-muted">{label}</dt>
      <dd class={`truncate font-medium ${verdict ? VERDICT_STYLE[verdict] : ''}`} title={value}>
        {value}
      </dd>
    </div>
  );
}
