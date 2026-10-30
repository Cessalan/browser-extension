import { useEffect, useState } from 'preact/hooks';
import { ReviewEmail } from './review/ReviewEmail';
import { SpeedTest } from './speedtest/SpeedTest';
import { Landing } from './landing/Landing';
import { Bench } from './bench/Bench';
import { setLang, useI18n } from './i18n';
import { ArrowLeft, Languages, PenLine, RefreshCw, Settings2 } from 'lucide-preact';
import { StylePanel } from './style/StylePanel';
import { useRegisterSW } from 'virtual:pwa-register/preact';

// The email screen is home; Setup is reached from the gear button. (Notes will join home as a tab.)
const PAGES: Record<string, () => preact.JSX.Element> = {
  '#/': ReviewEmail,
  '#/setup': SpeedTest,
  '#/speed-test': SpeedTest, // old address of Setup
  '#/bench': Bench, // quality bench, linked from Setup's technical details
};

const ONBOARDED_KEY = 'onboarded';

function isOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

// First visit: start on the landing page, which explains Confi and sets it up.
if (!isOnboarded() && (location.hash === '' || location.hash === '#/')) location.replace('#/welcome');

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(location.hash || '#/');
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [styleOpen, setStyleOpen] = useState(false);
  const { lang, t } = useI18n();
  const page = PAGES[hash];
  const onSetup = page === SpeedTest || page === Bench;
  const onLanding = hash === '#/welcome';

  function openApp() {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // Not critical: the landing page will just show again next time.
    }
    location.hash = '#/';
    scrollTo(0, 0);
  }

  return (
    <div class="min-h-screen">
      {onLanding && <Landing onOpen={openApp} />}
      <div hidden={onLanding}>
      <header class="border-b border-line bg-nav text-ink">
        <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <a href="#/" class="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-8 w-8" />
            <h1 class="text-lg font-semibold tracking-tight">Confi</h1>
          </a>
          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
              onClick={() => setStyleOpen(true)}
            >
              <PenLine size={16} aria-hidden="true" /> <span class="hidden sm:inline">{t('style.button')}</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
              lang={lang === 'fr' ? 'en' : 'fr'}
            >
              <Languages size={16} aria-hidden="true" /> {t('app.switchLang')}
            </button>
            <a
              href="#/setup"
              class={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${onSetup ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas hover:text-ink'}`}
              title={t('nav.setup')}
              aria-label={t('nav.setup')}
              aria-current={onSetup ? 'page' : undefined}
            >
              <Settings2 size={18} />
            </a>
          </div>
        </div>
      </header>
      {styleOpen && <StylePanel onClose={() => setStyleOpen(false)} />}
      <UpdateBanner />
      <main class="mx-auto max-w-6xl px-4 py-6">
        {onSetup && (
          <a href="#/" class="mx-auto mb-4 flex max-w-3xl items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft size={15} aria-hidden="true" /> {t('nav.back')}
          </a>
        )}
        {/* The email screen stays mounted (just hidden) so a draft survives a visit to Setup. */}
        <div hidden={onSetup}>
          <ReviewEmail />
        </div>
        {page === SpeedTest && <SpeedTest />}
        {page === Bench && <Bench />}
      </main>
      <footer class="mx-auto flex max-w-6xl gap-4 px-4 pb-6 text-xs text-muted">
        <span>{t('app.version', { v: __APP_VERSION__ })}</span>
        <a href="#/welcome" class="hover:text-ink">{t('land.about')}</a>
        <a href={lang === 'fr' ? '/blog/' : '/en/blog/'} class="hover:text-ink">{t('nav.blog')}</a>
      </footer>
      </div>
    </div>
  );
}

/** Shown when a new version has been deployed. The user chooses when to reload, so a draft is never lost. */
function UpdateBanner() {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="border-b border-brand/20 bg-brand-soft">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <RefreshCw size={16} class="text-brand" aria-hidden="true" />
        <span class="font-medium">{t('update.available')}</span>
        <span class="text-xs text-muted">{t('update.draftHint')}</span>
        <div class="ml-auto flex gap-2">
          <button type="button" class="rounded-md px-3 py-1 text-muted hover:bg-white/60" onClick={() => setNeedRefresh(false)}>
            {t('update.later')}
          </button>
          <button type="button" class="rounded-md bg-brand px-3 py-1 font-medium text-white hover:brightness-110" onClick={() => void updateServiceWorker(true)}>
            {t('update.refresh')}
          </button>
        </div>
      </div>
    </div>
  );
}
