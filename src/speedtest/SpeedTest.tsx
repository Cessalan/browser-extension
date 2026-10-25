import { useEffect, useState } from 'preact/hooks';
import { Button, Card, ProgressBar, type Progress } from '../ui';
import { useI18n } from '../i18n';
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
  const { t } = useI18n();

  useEffect(() => {
    getDeviceInfo().then(setDevice);
  }, []);

  const busy = llmProgress !== null || sttProgress !== null;

  async function testLlm() {
    if (!device) return;
    setError(null);
    // Ask the browser not to evict the model when disk space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    setLlmProgress({ fraction: 0, text: t('speed.starting') });
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
    setSttProgress({ fraction: 0, text: t('speed.starting') });
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
        <h2 class="text-xl font-semibold">{t('speed.title')}</h2>
        <p class="text-sm text-muted">
          {t('speed.intro')}
        </p>
      </div>

      <Card title={t('speed.computer')}>
        {!device ? (
          <p class="text-sm text-muted">{t('speed.checking')}</p>
        ) : (
          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Stat label={t('speed.gpuAccel')} value={device.webgpu ? t('speed.yes') : t('speed.no')} verdict={device.webgpu ? 'good' : 'slow'} />
            <Stat label={t('speed.ram')} value={device.memoryGB ? `${device.memoryGB}+ GB` : t('speed.unknown')} verdict={device.memoryGB == null ? undefined : device.memoryGB >= 8 ? 'good' : 'ok'} />
            <Stat label={t('speed.cores')} value={String(device.cores ?? '?')} />
            <Stat label={t('speed.storage')} value={device.storageFreeGB != null ? `${device.storageFreeGB} GB` : '?'} verdict={device.storageFreeGB == null ? undefined : device.storageFreeGB >= 3 ? 'good' : 'slow'} />
            <Stat label={t('speed.gpu')} value={device.gpu ?? '-'} />
            <Stat label={t('speed.builtInAI')} value={device.builtInAI} />
          </dl>
        )}
        {device && !device.webgpu && (
          <p class="mt-3 rounded-md bg-red-50 p-2 text-sm text-bad">
            {t('speed.noWebgpu')}
          </p>
        )}
      </Card>

      <Card title={t('speed.textModel')}>
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
          <Button onClick={testLlm} disabled={busy || !device?.webgpu}>{t('speed.run')}</Button>
        </div>
        <ProgressBar progress={llmProgress} />
        {llm && (
          <div class="mt-3 space-y-2">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Stat label={t('speed.speed')} value={`${llm.tokensPerSecond.toFixed(1)} tokens/s`} verdict={llmVerdict(llm.tokensPerSecond)} />
              <Stat label={t('speed.firstWord')} value={`${llm.firstTokenSeconds.toFixed(1)} s`} />
              <Stat label={llm.wasCached ? t('speed.loadCached') : t('speed.loadFirst')} value={`${llm.loadSeconds.toFixed(0)} s`} />
              <Stat label={t('speed.model')} value={llm.modelId.replace(/-q4f(16|32)_1-MLC$/, '')} />
            </dl>
            <details class="text-sm">
              <summary class="cursor-pointer text-muted">{t('speed.sample')}</summary>
              <pre class="mt-1 whitespace-pre-wrap rounded-md bg-canvas p-2 font-sans">{llm.output}</pre>
            </details>
          </div>
        )}
      </Card>

      <Card title={t('speed.dictation')}>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted">{t('speed.dictationInfo')}</span>
          <Button onClick={testStt} disabled={busy}>{t('speed.run')}</Button>
        </div>
        <ProgressBar progress={sttProgress} />
        {stt && (
          <div class="mt-3 space-y-2">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <Stat label={t('speed.transcribe')} value={t('speed.transcribeValue', { t: stt.transcribeSeconds.toFixed(1), a: stt.audioSeconds.toFixed(0) })} verdict={sttVerdict(stt)} />
              <Stat label={t('speed.load')} value={`${stt.loadSeconds.toFixed(1)} s`} />
            </dl>
            <p class="rounded-md bg-canvas p-2 text-sm">“{stt.text}”</p>
          </div>
        )}
      </Card>

      {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}

      <div class="flex items-center gap-3">
        <Button onClick={copyReport} disabled={!device} variant="secondary">
          {copied ? t('speed.copied') : t('speed.copy')}
        </Button>
        <span class="text-xs text-muted">{t('speed.copyHint')}</span>
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
