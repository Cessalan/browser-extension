import { useEffect, useState } from 'preact/hooks';
import { ReviewEmail } from './review/ReviewEmail';
import { SpeedTest } from './speedtest/SpeedTest';
import { setLang, useI18n, type Key } from './i18n';
import { Gauge, Languages, Lock, Mail, RefreshCw, type LucideIcon } from 'lucide-preact';
import { useRegisterSW } from 'virtual:pwa-register/preact';

const PAGES: { hash: string; label: Key; icon: LucideIcon; view: () => preact.JSX.Element }[] = [
  { hash: '#/', label: 'nav.review', icon: Mail, view: ReviewEmail },
  { hash: '#/speed-test', label: 'nav.speedTest', icon: Gauge, view: SpeedTest },
];

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
  const page = PAGES.find((p) => p.hash === hash) ?? PAGES[0];
  const View = page.view;

  return (
    <div class="min-h-screen">
      <header class="bg-nav text-white">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div class="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-7 w-7 rounded-md ring-1 ring-white/30" />
            <h1 class="text-lg font-semibold">Liaison Assistant</h1>
          </div>
          <nav class="flex gap-1">
            {PAGES.map((p) => (
              <a
                href={p.hash}
                class={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${p === page ? 'bg-white/15 font-medium' : 'text-white/75 hover:bg-white/10'}`}
              >
                <p.icon size={15} aria-hidden="true" />
                {t(p.label)}
              </a>
            ))}
          </nav>
          <div class="ml-auto flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/90">
              <Lock size={12} aria-hidden="true" /> {t('app.private')}
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md border border-white/25 px-2 py-0.5 text-xs hover:bg-white/10"
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
              lang={lang === 'fr' ? 'en' : 'fr'}
            >
              <Languages size={13} aria-hidden="true" /> {t('app.switchLang')}
            </button>
          </div>
        </div>
      </header>
      <UpdateBanner />
      <main class="mx-auto max-w-5xl px-4 py-6">
        <View />
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
