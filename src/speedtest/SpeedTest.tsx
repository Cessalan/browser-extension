import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  Brain, Check, Cpu, ChevronRight, CircleCheck, CircleX, Copy, HardDrive, MemoryStick, Mic, Monitor, MonitorCheck, ShieldCheck, Sparkles,
  Star, TriangleAlert, UserX, WifiOff, Zap, type LucideIcon,
} from 'lucide-preact';
import { Button, Card, ProgressBar, type Progress } from '../ui';
import { useI18n, type Key } from '../i18n';
import { ai } from '../ai/engine';
import { getDeviceInfo, type DeviceInfo } from './device';
import type { LlmResult } from './llm';
import type { SttResult } from './stt';
import { CPU_MODE, GPU_MODES, modeInfo, resolveModelId, type AiMode, gpuResetCount } from './models';
import { formatReport, llmVerdict, sttVerdict, type Verdict } from './report';
import { MODE_ORDER, isSoftwareGpu, recommendMode } from './recommend';

const MODE_ICONS: Record<AiMode, LucideIcon> = { compat: Cpu, fast: Zap, standard: Star, smart: Brain };

/**
 * "Setup" page: is this computer ready, and which AI mode to use.
 * Written for everyday users: no model names or jargon. Technical numbers live in a collapsed section for IT.
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
  const recommended = device ? recommendMode(device, llm && { mode: llm.mode, tokensPerSecond: llm.tokensPerSecond }, gpuResetCount()) : null;

  const busy = llmProgress !== null || sttProgress !== null;

  function chooseMode(next: AiMode) {
    setMode(next);
    setChosen(true);
    void ai.setMode(next);
  }

  // Without usable graphics only the processor ("Compatible") mode can run.
  const usableGpu = !!device?.webgpu && !isSoftwareGpu(device);
  const modes = usableGpu ? GPU_MODES : [CPU_MODE];
  const shownMode: AiMode = usableGpu ? mode : 'compat';

  async function testLlm() {
    if (!device) return;
    setError(null);
    // Ask the browser not to evict the model when disk space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    setLlmProgress({ fraction: 0, text: t('setup.starting') });
    try {
      // Loaded on demand so the app itself opens instantly.
      const { runCpuTest, runLlmTest } = await import('./llm');
      const report = (fraction: number) => setLlmProgress({ fraction, text: progressText(t, fraction) });
      const result =
        shownMode === 'compat'
          ? await runCpuTest(report)
          : await runLlmTest(resolveModelId(modeInfo(mode).modelId, device.shaderF16), report);
      setLlm({ ...result, mode: shownMode });
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
    <div class="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">{t('setup.title')}</h2>
        <p class="mt-1 text-sm text-muted">{t('setup.intro')}</p>
      </div>

      <PrivacyStrip />

      <ReadyBanner device={device} llm={llm} recommended={recommended} current={shownMode} onSwitch={chooseMode} />

      <Card title={t('setup.mode')}>
        <div role="radiogroup" aria-label={t('setup.mode')} class="space-y-2">
          {modes.map((m) => {
            const Icon = MODE_ICONS[m.mode];
            const selected = m.mode === mode;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                class={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                  selected ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/40 hover:bg-canvas/60'
                }`}
                onClick={() => chooseMode(m.mode)}
                disabled={busy}
              >
                <span
                  class={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span class="font-semibold">{t(`mode.${m.mode}` as Key)}</span>
                    {m.mode === recommended && (
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-brand">
                        <Sparkles size={12} aria-hidden="true" /> {t('setup.recommended')}
                      </span>
                    )}
                  </span>
                  <span class="mt-0.5 block text-sm text-muted">{t(`mode.${m.mode}.desc` as Key)}</span>
                </span>
                <span class="hidden shrink-0 self-center text-xs text-muted sm:block">~{m.downloadMB} {t('setup.mb')}</span>
                <span
                  class={`mt-2.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand' : 'border-line group-hover:border-brand/50'}`}
                  aria-hidden="true"
                >
                  {selected && <span class="h-2 w-2 rounded-full bg-brand" />}
                </span>
              </button>
            );
          })}
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button onClick={testLlm} disabled={busy || !device || !window.isSecureContext}>{t('setup.testMode')}</Button>
          <span class="text-xs text-muted">{chosen ? t('setup.modeSaved') : t('setup.autoPicked')}</span>
        </div>
        <ProgressBar progress={llmProgress} />
        {llm && (
          <dl class="mt-4 grid gap-3 sm:grid-cols-3">
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
          <dl class="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label={t('setup.voiceSpeed')}
              value={t(`verdict.${sttVerdict(stt)}` as Key)}
              sub={t('setup.voiceResult', { a: Math.round(stt.audioSeconds), t: stt.transcribeSeconds.toFixed(1) })}
              verdict={sttVerdict(stt)}
            />
          </dl>
        )}
      </Card>

      {error && <p class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-bad">{error}</p>}

      {device && (
        <details class="group rounded-xl border border-line bg-surface/70 px-5 py-4 text-sm">
          <summary class="cursor-pointer list-none font-medium text-muted marker:hidden">
            <span class="inline-flex items-center gap-2">
              <ChevronRight size={16} class="transition-transform group-open:rotate-90" aria-hidden="true" />
              {t('setup.technical')}
            </span>
          </summary>
          <p class="mt-2 text-xs text-muted">{t('setup.technicalHint')}</p>
          <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="WebGPU" value={device.webgpu ? 'yes' : 'no'} />
            <Stat label="Engine" value={shownMode === 'compat' ? 'CPU (WebAssembly)' : 'GPU (WebGPU)'} />
            <Stat label="CPU threads" value={crossOriginIsolated ? 'multi' : 'single'} />
            <Stat label="GPU" value={device.gpu ?? '-'} />
            <Stat label="shader-f16" value={device.shaderF16 ? 'yes' : 'no'} />
            <Stat label="CPU cores" value={String(device.cores ?? '?')} />
            <Stat label="Chrome built-in AI" value={device.builtInAI} />
            <Stat label="Model" value={resolveModelId(modeInfo(mode).modelId, device.shaderF16)} />
            {llm && <Stat label="Decode" value={`${llm.tokensPerSecond.toFixed(1)} tok/s (${llm.mode})`} />}
            <Stat label="Memory (reported)" value={device.memoryGB != null ? `${device.memoryGB} GB` : '?'} />
          </dl>
          {llm?.output && <pre class="mt-3 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-xs">{llm.output}</pre>}
          {stt?.text && <p class="mt-2 rounded-lg bg-canvas p-3 text-xs">“{stt.text}”</p>}
          <div class="mt-4">
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

/** Three quiet promises, shown up front because trust is the point of Confi. */
function PrivacyStrip() {
  const { t } = useI18n();
  const items: [LucideIcon, Key][] = [
    [ShieldCheck, 'trust.local'],
    [WifiOff, 'trust.offline'],
    [UserX, 'trust.noAccount'],
  ];
  return (
    <ul class="grid gap-2 sm:grid-cols-3">
      {items.map(([Icon, key]) => (
        <li class="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm shadow-card">
          <Icon size={17} class="shrink-0 text-brand" aria-hidden="true" />
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );
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

  const usableGpu = !!device?.webgpu && !isSoftwareGpu(device);
  if (device && !window.isSecureContext) {
    [tone, title, hint] = ['bad', 'land.start.insecure', 'setup.notSupportedHint'];
  } else if (device && llm) {
    const v = llmVerdict(llm.tokensPerSecond);
    [tone, title] = v === 'good' ? ['good', 'setup.ready'] : v === 'ok' ? ['warn', 'setup.okSlow'] : ['bad', 'setup.slow'];
  } else if (device && !usableGpu) {
    [tone, title, hint] = ['info', 'setup.compatTitle', 'land.start.noGpu'];
  } else if (device) {
    [tone, title, hint] = ['info', 'setup.runTestTitle', 'setup.runTest'];
  }

  const style = {
    good: ['bg-green-50 text-good ring-green-200', CircleCheck],
    warn: ['bg-amber-50 text-warn ring-amber-200', TriangleAlert],
    bad: ['bg-red-50 text-bad ring-red-200', CircleX],
    info: ['bg-brand-soft text-brand ring-brand/20', MonitorCheck],
  } as const;
  const [badge, Icon] = style[tone];
  const heavierThanFit = recommended != null && MODE_ORDER.indexOf(current) > MODE_ORDER.indexOf(recommended);

  return (
    <section class="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div class="flex gap-4">
        <span class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ${badge}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-base font-semibold tracking-tight">{t(title)}</p>
          {hint && <p class="mt-0.5 text-sm text-muted">{t(hint)}</p>}
          {usableGpu && recommended && recommended !== current && (
            !llm && heavierThanFit ? (
              <p class="mt-2 text-sm text-muted">{t('setup.testFirst')}</p>
            ) : (
              <div class="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                <Sparkles size={15} class="text-brand" aria-hidden="true" />
                <span>{t('setup.suggest', { mode: t(`mode.${recommended}` as Key) })}</span>
                <Button variant="secondary" onClick={() => onSwitch(recommended)}>
                  {t('setup.switchTo', { mode: t(`mode.${recommended}` as Key) })}
                </Button>
              </div>
            )
          )}
        </div>
      </div>
      {device && (
        <ul class="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-muted">
          <Fact ok={usableGpu} icon={Monitor}>{t('setup.graphics')}</Fact>
          {device.memoryGB != null && <Fact ok={device.memoryGB >= 8} icon={MemoryStick}>{t('setup.memory', { gb: device.memoryGB })}</Fact>}
          {device.storageFreeGB != null && <Fact ok={device.storageFreeGB >= 3} icon={HardDrive}>{t('setup.space', { gb: device.storageFreeGB })}</Fact>}
        </ul>
      )}
    </section>
  );
}

function Fact({ ok, icon: Icon, children }: { ok: boolean; icon: LucideIcon; children: ComponentChildren }) {
  return (
    <li class="inline-flex items-center gap-2">
      <Icon size={15} aria-hidden="true" />
      <span class="text-ink">{children}</span>
      {ok ? <CircleCheck size={14} class="text-good" aria-label="OK" /> : <TriangleAlert size={14} class="text-warn" aria-label="!" />}
    </li>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: 'text-good',
  ok: 'text-warn',
  slow: 'text-bad',
};

function Stat({ label, value, sub, verdict }: { label: string; value: string; sub?: string; verdict?: Verdict }) {
  return (
    <div class="min-w-0 rounded-lg bg-canvas/70 px-3 py-2.5">
      <dt class="text-xs text-muted">{label}</dt>
      <dd class={`truncate font-medium ${verdict ? VERDICT_STYLE[verdict] : ''}`} title={value}>
        {value}
      </dd>
      {sub && <dd class="text-xs text-muted">{sub}</dd>}
    </div>
  );
}
