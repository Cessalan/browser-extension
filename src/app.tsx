import { useEffect, useState } from 'preact/hooks';
import { ReviewEmail } from './review/ReviewEmail';
import { SpeedTest } from './speedtest/SpeedTest';
import { setLang, useI18n } from './i18n';
import { ArrowLeft, Languages, RefreshCw, Settings2 } from 'lucide-preact';
import { useRegisterSW } from 'virtual:pwa-register/preact';

// The email screen is home; Setup is reached from the gear button. (Notes will join home as a tab.)
const PAGES: Record<string, () => preact.JSX.Element> = {
  '#/': ReviewEmail,
  '#/setup': SpeedTest,
  '#/speed-test': SpeedTest, // old address of Setup
};

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
  const { lang, t } = useI18n();
  const onSetup = PAGES[hash] === SpeedTest;

  return (
    <div class="min-h-screen">
      <header class="border-b border-line bg-nav text-ink">
        <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a href="#/" class="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-8 w-8" />
            <h1 class="text-lg font-semibold tracking-tight">Confi</h1>
          </a>
          <div class="ml-auto flex items-center gap-1">
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
      <UpdateBanner />
      <main class="mx-auto max-w-5xl px-4 py-6">
        {onSetup && (
          <a href="#/" class="mx-auto mb-4 flex max-w-3xl items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft size={15} aria-hidden="true" /> {t('nav.back')}
          </a>
        )}
        {/* The email screen stays mounted (just hidden) so a draft survives a visit to Setup. */}
        <div hidden={onSetup}>
          <ReviewEmail />
        </div>
        {onSetup && <SpeedTest />}
      </main>
      <footer class="mx-auto max-w-5xl px-4 pb-6 text-xs text-muted">{t('app.version', { v: __APP_VERSION__ })}</footer>
    </div>
  );
}

/** Shown when a new version has been deployed. The nurse chooses when to reload, so a draft is never lost. */
function UpdateBanner() {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="border-b border-brand/20 bg-brand-soft">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
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
