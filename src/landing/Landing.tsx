import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  ArrowRight, Brain, Cpu, Globe, Briefcase, HeartHandshake, Scale, Stethoscope, CircleCheck, CloudOff, Download, FileSearch, HardDrive, Languages, Lock, MemoryStick, Monitor,
  ShieldCheck, Sparkles, Star, TriangleAlert, UserX, WifiOff, Zap, type LucideIcon,
} from 'lucide-preact';
import { setLang, useI18n, type Key } from '../i18n';
import { ai, useAiStatus } from '../ai/engine';
import { getDeviceInfo, type DeviceInfo } from '../speedtest/device';
import { modeInfo, type AiMode, gpuResetCount } from '../speedtest/models';
import { isSoftwareGpu, modesFor, recommendMode, shownModeFor } from '../speedtest/recommend';

const MODE_ICONS: Record<AiMode, LucideIcon> = { chrome: Globe, compat: Cpu, fast: Zap, standard: Star, smart: Brain };
const logo = `${import.meta.env.BASE_URL}icon.svg`;

/**
 * First-visit page: what Confi does, why it's safe, and a guided setup that checks this computer
 * and downloads the right AI for it. Claims stay factual: no compliance badges we can't back.
 */
export function Landing({ onOpen }: { onOpen: () => void }) {
  const { lang, t } = useI18n();
  const start = useRef<HTMLElement>(null);
  const how = useRef<HTMLElement>(null);
  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div class="min-h-screen bg-surface text-ink">
      {/* Nav */}
      <header class="sticky top-0 z-10 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div class="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <img src={logo} alt="" class="h-8 w-8" />
          <span class="text-lg font-semibold tracking-tight">Confi</span>
          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
              lang={lang === 'fr' ? 'en' : 'fr'}
            >
              <Languages size={16} aria-hidden="true" /> {t('app.switchLang')}
            </button>
            <button type="button" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-button hover:bg-brand-strong" onClick={() => scrollTo(start.current)}>
              {t('land.cta')}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section class="bg-canvas">
        <div class="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <span class="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface px-3 py-1 text-sm text-brand">
              <Lock size={14} aria-hidden="true" /> {t('land.eyebrow')}
            </span>
            <h1 class="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{t('land.title')}</h1>
            <p class="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('land.subtitle')}</p>
            <div class="mt-8 flex flex-wrap gap-3">
              <button type="button" class="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-white shadow-button hover:bg-brand-strong" onClick={() => scrollTo(start.current)}>
                {t('land.cta')} <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button type="button" class="rounded-xl border border-line bg-surface px-5 py-3 font-medium shadow-sm hover:border-brand/40" onClick={() => scrollTo(how.current)}>
                {t('land.howLink')}
              </button>
            </div>
            <p class="mt-6 text-sm text-muted">{t('land.trustLine')}</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Value */}
      <section class="mx-auto max-w-6xl px-5 py-20">
        <div class="grid gap-6 md:grid-cols-3">
          <Value icon={Sparkles} title="land.v1.title" text="land.v1.text" />
          <Value icon={ShieldCheck} title="land.v2.title" text="land.v2.text" />
          <Value icon={Languages} title="land.v3.title" text="land.v3.text" />
        </div>
      </section>

      {/* Who it's for */}
      <section class="border-t border-line bg-canvas/50">
        <div class="mx-auto max-w-6xl px-5 py-20">
          <div class="max-w-2xl">
            <h2 class="text-3xl font-semibold tracking-tight">{t('land.who.title')}</h2>
            <p class="mt-4 text-lg leading-relaxed text-muted">{t('land.who.text')}</p>
          </div>
          <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Audience icon={Stethoscope} title="land.who.health" text="land.who.health.text" />
            <Audience icon={Scale} title="land.who.legal" text="land.who.legal.text" />
            <Audience icon={Briefcase} title="land.who.hr" text="land.who.hr.text" />
            <Audience icon={HeartHandshake} title="land.who.social" text="land.who.social.text" />
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section class="bg-[#0f2a4a] text-white">
        <div class="mx-auto max-w-6xl px-5 py-20">
          <div class="max-w-2xl">
            <h2 class="text-3xl font-semibold tracking-tight">{t('land.privacy.title')}</h2>
            <p class="mt-4 text-lg leading-relaxed text-white/75">{t('land.privacy.text')}</p>
          </div>
          <div class="mt-10 flex flex-wrap items-center gap-3 text-sm">
            <Flow>{t('land.flow.email')}</Flow>
            <ArrowRight size={18} class="text-white/50" aria-hidden="true" />
            <Flow strong>{t('land.flow.ai')}</Flow>
            <ArrowRight size={18} class="text-white/50" aria-hidden="true" />
            <Flow>{t('land.flow.result')}</Flow>
            <span class="ml-2 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-white/70">
              <CloudOff size={16} aria-hidden="true" /> {t('land.flow.noCloud')}
            </span>
          </div>
          <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <PromiseItem icon={Lock} title="land.p1.title" text="land.p1.text" />
            <PromiseItem icon={WifiOff} title="land.p2.title" text="land.p2.text" />
            <PromiseItem icon={UserX} title="land.p3.title" text="land.p3.text" />
            <PromiseItem icon={FileSearch} title="land.p4.title" text="land.p4.text" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section ref={how} class="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <h2 class="text-3xl font-semibold tracking-tight">{t('land.how.title')}</h2>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          {(['1', '2', '3'] as const).map((n) => (
            <li class="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{n}</span>
              <h3 class="mt-4 text-lg font-semibold">{t(`land.how.${n}.title` as Key)}</h3>
              <p class="mt-2 leading-relaxed text-muted">{t(`land.how.${n}.text` as Key)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Get started */}
      <section ref={start} class="scroll-mt-20 bg-canvas">
        <div class="mx-auto max-w-4xl px-5 py-20">
          <h2 class="text-center text-3xl font-semibold tracking-tight">{t('land.start.title')}</h2>
          <p class="mx-auto mt-3 max-w-xl text-center text-muted">{t('land.start.text')}</p>
          <GetStarted onOpen={onOpen} />
        </div>
      </section>

      {/* FAQ */}
      <section class="mx-auto max-w-3xl px-5 py-20">
        <h2 class="text-3xl font-semibold tracking-tight">{t('land.faq.title')}</h2>
        <div class="mt-8 divide-y divide-line rounded-2xl border border-line">
          {(['1', '2', '3', '4', '5'] as const).map((n) => (
            <details class="group px-6 py-5">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
                {t(`land.faq.${n}.q` as Key)}
                <span class="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p class="mt-3 leading-relaxed text-muted">{t(`land.faq.${n}.a` as Key)}</p>
            </details>
          ))}
        </div>
      </section>

      <footer class="border-t border-line">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-8 text-sm text-muted">
          <img src={logo} alt="" class="h-6 w-6" />
          <span class="font-medium text-ink">Confi</span>
          <span>{t('land.footer')}</span>
          <span class="ml-auto">{t('app.version', { v: __APP_VERSION__ })}</span>
        </div>
      </footer>
    </div>
  );
}

/** A small, static preview of the product: a rewrite with the patient details kept safe. */
function ProductPreview() {
  const { t } = useI18n();
  return (
    <div class="relative" aria-hidden="true">
      <div class="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div class="flex items-center gap-2 border-b border-line pb-3 text-sm">
          <span class="font-semibold">{t('land.preview.title')}</span>
          <span class="ml-auto rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">{t('land.preview.badge')}</span>
        </div>
        <div class="space-y-3 pb-8 pt-4 text-[15px] leading-relaxed">
          <p>{t('land.preview.hello')}</p>
          <p>
            <del class="rounded bg-red-100 px-0.5 text-bad">{t('land.preview.old')}</del>{' '}
            <ins class="rounded bg-brand-soft px-0.5 text-brand no-underline">{t('land.preview.new')}</ins>{' '}
            {t('land.preview.rest')} <span class="rounded bg-canvas px-1 font-mono text-sm">4482913</span>.
          </p>
          <p>
            {t('land.preview.ask')} <mark class="rounded bg-yellow-200 px-0.5">{t('land.preview.deadline')}</mark>
          </p>
        </div>
      </div>
      <div class="absolute -bottom-5 left-6 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-card">
        <img src={logo} alt="" class="h-6 w-6" />
        <span>
          <strong class="font-semibold">{t('land.preview.protected')}</strong> · {t('land.preview.local')}
        </span>
      </div>
    </div>
  );
}

function Value({ icon: Icon, title, text }: { icon: LucideIcon; title: Key; text: Key }) {
  const { t } = useI18n();
  return (
    <div class="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 class="mt-5 text-lg font-semibold">{t(title)}</h3>
      <p class="mt-2 leading-relaxed text-muted">{t(text)}</p>
    </div>
  );
}

function Audience({ icon: Icon, title, text }: { icon: LucideIcon; title: Key; text: Key }) {
  const { t } = useI18n();
  return (
    <div class="flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <Icon size={22} class="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <div>
        <h3 class="font-semibold">{t(title)}</h3>
        <p class="mt-1 text-sm leading-relaxed text-muted">{t(text)}</p>
      </div>
    </div>
  );
}

function Flow({ children, strong }: { children: ComponentChildren; strong?: boolean }) {
  return (
    <span class={`rounded-xl px-4 py-2.5 ${strong ? 'bg-white font-medium text-[#0f2a4a]' : 'border border-white/20 text-white/90'}`}>{children}</span>
  );
}

function PromiseItem({ icon: Icon, title, text }: { icon: LucideIcon; title: Key; text: Key }) {
  const { t } = useI18n();
  return (
    <div>
      <Icon size={22} class="text-sky-300" aria-hidden="true" />
      <h3 class="mt-3 font-semibold">{t(title)}</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-white/70">{t(text)}</p>
    </div>
  );
}

/** Checks this computer, suggests the right AI mode, downloads it once, then opens the app. */
function GetStarted({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const status = useAiStatus();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [mode, setMode] = useState<AiMode>(ai.mode);

  useEffect(() => {
    getDeviceInfo().then(setDevice);
    void ai.resolveMode().then(setMode);
  }, []);

  const recommended = device ? recommendMode(device, undefined, gpuResetCount()) : null;
  const usableGpu = !!device?.webgpu && !isSoftwareGpu(device);
  const modes = modesFor(device);
  const shownMode: AiMode = device ? shownModeFor(device, mode) : mode;
  const secure = window.isSecureContext;
  const installed = status.state === 'ready' || (status.state === 'idle' && status.cached === true);
  const size = modeInfo(shownMode).downloadMB;
  // Chrome's AI: Chrome downloads it itself, once, for every site; Confi doesn't know its size.
  const byChrome = !!modeInfo(shownMode).builtin;
  const lowSpace = device?.storageFreeGB != null && device.storageFreeGB * 1000 < size * 1.5;

  function choose(m: AiMode) {
    setMode(m);
    void ai.setMode(m);
  }

  return (
    <div class="mt-10 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* Step 1: this computer */}
      <div class="border-b border-line p-6">
        <p class="text-sm font-medium text-muted">{t('land.start.step1')}</p>
        {!device ? (
          <p class="mt-2">{t('setup.checking')}</p>
        ) : !secure ? (
          <div class="mt-3 flex gap-3 rounded-xl bg-red-50 p-4 text-sm">
            <TriangleAlert size={20} class="shrink-0 text-bad" aria-hidden="true" />
            <div>
              <p class="font-medium text-bad">{t('land.start.insecure')}</p>
              <a class="mt-1 inline-block font-medium text-brand underline" href={location.href.replace(/^http:/, 'https:')}>
                {t('land.start.openSecure')}
              </a>
            </div>
          </div>
        ) : (
          <>
            <ul class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Check ok={usableGpu} icon={Monitor}>{t('setup.graphics')}</Check>
              {device.memoryGB != null && <Check ok={device.memoryGB >= 8} icon={MemoryStick}>{t('setup.memory', { gb: device.memoryGB })}</Check>}
              {device.storageFreeGB != null && <Check ok={!lowSpace} icon={HardDrive}>{t('setup.space', { gb: device.storageFreeGB })}</Check>}
            </ul>
            {!usableGpu && shownMode !== 'chrome' && <p class="mt-3 text-sm text-muted">{t('land.start.noGpu')}</p>}
          </>
        )}
      </div>

      {/* Step 2: mode */}
      {device && secure && (
        <div class="border-b border-line p-6">
          <p class="text-sm font-medium text-muted">{t('land.start.step2')}</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('setup.mode')}>
            {modes.map((m) => {
              const Icon = MODE_ICONS[m.mode];
              const selected = m.mode === shownMode;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={status.state === 'loading'}
                  class={`flex flex-col items-start justify-start rounded-xl border p-3.5 text-left transition-colors ${selected ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/40'}`}
                  onClick={() => choose(m.mode)}
                >
                  <span class="flex items-center gap-2 font-semibold">
                    <Icon size={16} class="text-brand" aria-hidden="true" /> {t(`mode.${m.mode}` as Key)}
                  </span>
                  {m.mode === recommended && (
                    <span class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand">
                      <Sparkles size={12} aria-hidden="true" /> {t('setup.recommended')}
                    </span>
                  )}
                  <span class="mt-1 block text-xs text-muted">{m.builtin ? t('setup.byChrome') : `~${m.downloadMB} ${t('setup.mb')}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: download, then open */}
      {device && secure && (
        <div class="p-6">
          {installed ? (
            <div class="flex flex-wrap items-center gap-4">
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-good ring-1 ring-green-200">
                <CircleCheck size={22} aria-hidden="true" />
              </span>
              <div>
                <p class="font-semibold">{t('land.start.ready')}</p>
                <p class="text-sm text-muted">{t('land.start.readyText')}</p>
              </div>
              <button type="button" class="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-white shadow-button hover:bg-brand-strong" onClick={onOpen}>
                {t('land.start.open')} <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : status.state === 'loading' ? (
            <div>
              <div class="flex justify-between text-sm">
                <span class="font-medium">{t('setup.downloading', { pct: Math.round(status.fraction * 100) })}</span>
                <span class="text-muted">{byChrome ? t('setup.byChrome') : `~${size} ${t('setup.mb')}`}</span>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
                <div class="progress-shine h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
              </div>
              <p class="mt-2 text-sm text-muted">{t(byChrome ? 'land.start.chromeHint' : 'land.start.downloadingHint')}</p>
            </div>
          ) : (
            <div class="flex flex-wrap items-center gap-4">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-white shadow-button hover:bg-brand-strong"
                onClick={() => void ai.load().catch(() => {})}
              >
                <Download size={18} aria-hidden="true" /> {byChrome ? t('ai.downloadChrome') : t('land.start.download', { mb: size })}
              </button>
              <p class="text-sm text-muted">{t('land.start.once')}</p>
              {status.state === 'error' && <p class="w-full text-sm text-bad">{t('land.start.error')}</p>}
              {lowSpace && <p class="w-full text-sm text-warn">{t('land.start.lowSpace')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Check({ ok, icon: Icon, children }: { ok: boolean; icon: LucideIcon; children: ComponentChildren }) {
  return (
    <li class="inline-flex items-center gap-2">
      <Icon size={16} class="text-muted" aria-hidden="true" />
      {children}
      {ok ? <CircleCheck size={15} class="text-good" aria-label="OK" /> : <TriangleAlert size={15} class="text-warn" aria-label="!" />}
    </li>
  );
}
