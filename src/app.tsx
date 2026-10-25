import { useEffect, useState } from 'preact/hooks';
import { ReviewEmail } from './review/ReviewEmail';
import { SpeedTest } from './speedtest/SpeedTest';

const PAGES = [
  { hash: '#/', label: 'Review email', view: ReviewEmail },
  { hash: '#/speed-test', label: 'Speed test', view: SpeedTest },
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
                {p.label}
              </a>
            ))}
          </nav>
          <span class="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs">🔒 Runs on this computer only</span>
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-4 py-6">
        <View />
      </main>
    </div>
  );
}
