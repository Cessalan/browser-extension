import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Brain, CircleCheck, CircleX, Copy, Check, Info, Mic, Star, TriangleAlert, Zap, type LucideIcon } from 'lucide-preact';
import { Button, Card, ProgressBar, type Progress } from '../ui';
import { useI18n, type Key } from '../i18n';
import { ai } from '../ai/engine';
import { getDeviceInfo, type DeviceInfo } from './device';
import type { LlmResult } from './llm';
import type { SttResult } from './stt';
import { AI_MODES, modeInfo, resolveModelId, type AiMode } from './models';
import { formatReport, llmVerdict, sttVerdict, type Verdict } from './report';
import { MODE_ORDER, isSoftwareGpu, recommendMode } from './recommend';

const MODE_ICONS: Record<AiMode, LucideIcon> = { fast: Zap, standard: Star, smart: Brain };

/**
 * "Setup" page: is this computer ready, and which AI mode to use.
 * Written for nurses: no model names or jargon. Technical numbers live in a collapsed section for IT.
 */
export function SpeedTest() {
  const { t } = useI18n();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [mode, setMode] = useState<AiMode>(ai.mode);
  const [chosen, setChosen] = useState(ai.chosen);
  // The speed test result, and which mode it measured.
  const [llm, setLlm] = useState<LlmResult & { mode: AiMode }>();
  const [stt, setStt] = useState<SttResult>();
  const [llmProgress, setLlmProgress] = useState<Progress>(null);
  const [sttProgress, setSttProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDeviceInfo().then(setDevice);
    void ai.resolveMode().then(setMode);
  }, []);

  // What suits this computer: from its specs, refined by the speed test once it has run.
  const recommended = device ? recommendMode(device, llm && { mode: llm.mode, tokensPerSecond: llm.tokensPerSecond }) : null;

  const busy = llmProgress !== null || sttProgress !== null;

  function chooseMode(next: AiMode) {
    setMode(next);
    setChosen(true);
    void ai.setMode(next);
  }

  async function testLlm() {
    if (!device) return;
    setError(null);
    // Ask the browser not to evict the model when disk space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    setLlmProgress({ fraction: 0, text: t('setup.starting') });
    try {
      // Loaded on demand so the app itself opens instantly.
      const { runLlmTest } = await import('./llm');
      const modelId = resolveModelId(modeInfo(mode).modelId, device.shaderF16);
      const result = await runLlmTest(modelId, (fraction) => setLlmProgress({ fraction, text: progressText(t, fraction) }));
      setLlm({ ...result, mode });
    } catch (err) {
      setError(`${t('setup.writing')}: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLlmProgress(null);
    }
  }

  async function testStt() {
    setError(null);
    setSttProgress({ fraction: 0, text: t('setup.starting') });
    try {
      const { runSttTest } = await import('./stt');
      setStt(await runSttTest((fraction) => setSttProgress({ fraction, text: progressText(t, fraction) })));
    } catch (err) {
      setError(`${t('setup.voice')}: ${err instanceof Error ? err.message : err}`);
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
        <h2 class="text-xl font-semibold">{t('setup.title')}</h2>
        <p class="text-sm text-muted">{t('setup.intro')}</p>
      </div>

      <ReadyBanner device={device} llm={llm} recommended={recommended} current={mode} onSwitch={chooseMode} />

      <Card title={t('setup.mode')}>
        <div class="grid gap-2 sm:grid-cols-3">
          {AI_MODES.map((m) => {
            const Icon = MODE_ICONS[m.mode];
            const selected = m.mode === mode;
            return (
              <button
                type="button"
                class={`flex h-full flex-col justify-start rounded-lg border p-3 text-left transition ${selected ? 'border-brand bg-brand-soft/60 ring-2 ring-brand/30' : 'border-line hover:border-brand/50 hover:bg-canvas'}`}
                onClick={() => chooseMode(m.mode)}
                disabled={busy}
                aria-pressed={selected}
              >
                <div class="flex items-center gap-2 font-medium">
                  <Icon size={16} class="text-brand" aria-hidden="true" />
                  {t(`mode.${m.mode}` as Key)}
                  {m.mode === recommended && (
                    <span class="ml-auto whitespace-nowrap rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{t('setup.recommended')}</span>
                  )}
                </div>
                <p class="mt-1 text-xs text-muted">{t(`mode.${m.mode}.desc` as Key)}</p>
                <p class="mt-auto pt-2 text-xs text-muted">{t('setup.download', { mb: m.downloadMB })}</p>
              </button>
            );
          })}
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={testLlm} disabled={busy || !device?.webgpu}>{t('setup.testMode')}</Button>
          <span class="text-xs text-muted">{chosen ? t('setup.modeSaved') : t('setup.autoPicked')}</span>
        </div>
        <ProgressBar progress={llmProgress} />
        {llm && (
          <dl class="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Stat
              label={t('setup.writingSpeed')}
              value={t(`verdict.${llmVerdict(llm.tokensPerSecond)}` as Key)}
              sub={t('setup.wordsPerSec', { n: Math.max(1, Math.round(llm.tokensPerSecond / 1.3)) })}
              verdict={llmVerdict(llm.tokensPerSecond)}
            />
            <Stat label={t('setup.startsIn')} value={`${llm.firstTokenSeconds.toFixed(1)} s`} />
            <Stat label={llm.wasCached ? t('setup.readyIn') : t('setup.firstSetup')} value={`${Math.round(llm.loadSeconds)} s`} />
          </dl>
        )}
      </Card>

      <Card title={t('setup.voice')}>
        <div class="flex flex-wrap items-center gap-3">
          <Button onClick={testStt} disabled={busy} variant="secondary" icon={Mic}>{t('setup.testVoice')}</Button>
          <span class="text-xs text-muted">{t('setup.voiceInfo')}</span>
        </div>
        <ProgressBar progress={sttProgress} />
        {stt && (
          <dl class="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Stat
              label={t('setup.voiceSpeed')}
              value={t(`verdict.${sttVerdict(stt)}` as Key)}
              sub={t('setup.voiceResult', { a: Math.round(stt.audioSeconds), t: stt.transcribeSeconds.toFixed(1) })}
              verdict={sttVerdict(stt)}
            />
          </dl>
        )}
      </Card>

      {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {device && (
        <details class="rounded-lg border border-line bg-surface p-4 text-sm">
          <summary class="cursor-pointer font-medium text-muted">{t('setup.technical')}</summary>
          <p class="mt-2 text-xs text-muted">{t('setup.technicalHint')}</p>
          <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Stat label="WebGPU" value={device.webgpu ? 'yes' : 'no'} />
            <Stat label="GPU" value={device.gpu ?? '-'} />
            <Stat label="shader-f16" value={device.shaderF16 ? 'yes' : 'no'} />
            <Stat label="CPU cores" value={String(device.cores ?? '?')} />
            <Stat label="Chrome built-in AI" value={device.builtInAI} />
            <Stat label="Model" value={resolveModelId(modeInfo(mode).modelId, device.shaderF16)} />
            {llm && <Stat label="Decode" value={`${llm.tokensPerSecond.toFixed(1)} tok/s (${llm.mode})`} />}
            <Stat label="Memory (reported)" value={device.memoryGB != null ? `${device.memoryGB} GB` : '?'} />
          </dl>
          {llm?.output && <pre class="mt-3 whitespace-pre-wrap rounded-md bg-canvas p-2 text-xs">{llm.output}</pre>}
          {stt?.text && <p class="mt-2 rounded-md bg-canvas p-2 text-xs">“{stt.text}”</p>}
          <div class="mt-3">
            <Button onClick={copyReport} variant="secondary" icon={copied ? Check : Copy}>
              {copied ? t('editor.copied') : t('setup.copy')}
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}

function progressText(t: (k: Key, p?: Record<string, string | number>) => string, fraction: number) {
  return fraction >= 1 ? t('setup.almostReady') : t('setup.downloading', { pct: Math.round(fraction * 100) });
}

/** One plain-language answer to "can I use Confi on this computer?" */
function ReadyBanner({
  device,
  llm,
  recommended,
  current,
  onSwitch,
}: {
  device: DeviceInfo | null;
  llm?: LlmResult;
  recommended: AiMode | null;
  current: AiMode;
  onSwitch: (mode: AiMode) => void;
}) {
  const { t } = useI18n();
  let tone: 'good' | 'warn' | 'bad' | 'info' = 'info';
  let title: Key = 'setup.checking';
  let hint: Key | null = null;

  if (device && !device.webgpu) {
    [tone, title, hint] = ['bad', 'setup.notSupported', 'setup.notSupportedHint'];
  } else if (device && llm) {
    const v = llmVerdict(llm.tokensPerSecond);
    [tone, title] = v === 'good' ? ['good', 'setup.ready'] : v === 'ok' ? ['warn', 'setup.okSlow'] : ['bad', 'setup.slow'];
  } else if (device) {
    [tone, title, hint] = ['info', 'setup.runTest', null];
  }

  const style = {
    good: ['border-green-200 bg-green-50 text-good', CircleCheck],
    warn: ['border-amber-200 bg-amber-50 text-warn', TriangleAlert],
    bad: ['border-red-200 bg-red-50 text-bad', CircleX],
    info: ['border-line bg-surface text-ink', Info],
  } as const;
  const [classes, Icon] = style[tone];

  return (
    <div class={`flex gap-3 rounded-lg border p-4 ${classes}`}>
      <Icon size={22} class="shrink-0" aria-hidden="true" />
      <div>
        <p class="font-medium">{t(title)}</p>
        {hint && <p class="mt-0.5 text-sm text-ink/80">{t(hint)}</p>}
        {device?.webgpu && recommended && recommended !== current && !llm && MODE_ORDER.indexOf(current) > MODE_ORDER.indexOf(recommended) ? (
          <p class="mt-1 text-sm text-ink/80">{t('setup.testFirst')}</p>
        ) : device?.webgpu && recommended && recommended !== current && (
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>{t('setup.suggest', { mode: t(`mode.${recommended}` as Key) })}</span>
            <Button variant="secondary" onClick={() => onSwitch(recommended)}>
              {t('setup.switchTo', { mode: t(`mode.${recommended}` as Key) })}
            </Button>
          </div>
        )}
        {device && (
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Fact ok={device.webgpu && !isSoftwareGpu(device)}>{t('setup.graphics')}</Fact>
            {device.memoryGB != null && <Fact ok={device.memoryGB >= 8}>{t('setup.memory', { gb: device.memoryGB })}</Fact>}
            {device.storageFreeGB != null && <Fact ok={device.storageFreeGB >= 3}>{t('setup.space', { gb: device.storageFreeGB })}</Fact>}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ ok, children }: { ok: boolean; children: ComponentChildren }) {
  return (
    <span class="inline-flex items-center gap-1">
      {ok ? <CircleCheck size={13} class="text-good" aria-hidden="true" /> : <TriangleAlert size={13} class="text-warn" aria-hidden="true" />}
      {children}
    </span>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: 'text-good',
  ok: 'text-warn',
  slow: 'text-bad',
};

function Stat({ label, value, sub, verdict }: { label: string; value: string; sub?: string; verdict?: Verdict }) {
  return (
    <div class="min-w-0">
      <dt class="text-xs text-muted">{label}</dt>
      <dd class={`truncate font-medium ${verdict ? VERDICT_STYLE[verdict] : ''}`} title={value}>
        {value}
      </dd>
      {sub && <dd class="text-xs text-muted">{sub}</dd>}
    </div>
  );
}
