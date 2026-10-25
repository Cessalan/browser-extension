import { useEffect, useState } from 'preact/hooks';
import { ReviewEmail } from './review/ReviewEmail';
import { SpeedTest } from './speedtest/SpeedTest';
import { setLang, useI18n, type Key } from './i18n';

const PAGES: { hash: string; label: Key; view: () => preact.JSX.Element }[] = [
  { hash: '#/', label: 'nav.review', view: ReviewEmail },
  { hash: '#/speed-test', label: 'nav.speedTest', view: SpeedTest },
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
      <header class="bg-brand text-white">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div class="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-7 w-7 rounded-md ring-1 ring-white/30" />
            <h1 class="text-lg font-semibold">Liaison Assistant</h1>
          </div>
          <nav class="flex gap-1">
            {PAGES.map((p) => (
              <a
                href={p.hash}
                class={`rounded-md px-3 py-1 text-sm ${p === page ? 'bg-white/20 font-medium' : 'text-white/80 hover:bg-white/10'}`}
              >
                {t(p.label)}
              </a>
            ))}
          </nav>
          <div class="ml-auto flex items-center gap-2">
            <span class="rounded-full bg-white/15 px-2.5 py-0.5 text-xs">{t('app.private')}</span>
            <button
              type="button"
              class="rounded-md border border-white/30 px-2 py-0.5 text-xs hover:bg-white/10"
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
              lang={lang === 'fr' ? 'en' : 'fr'}
            >
              {t('app.switchLang')}
            </button>
          </div>
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-4 py-6">
        <View />
      </main>
    </div>
  );
}
