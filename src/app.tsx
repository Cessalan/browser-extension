import { SpeedTest } from './speedtest/SpeedTest';

export function App() {
  return (
    <div class="min-h-screen">
      <header class="bg-brand text-white">
        <div class="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-7 w-7 rounded-md ring-1 ring-white/30" />
          <h1 class="text-lg font-semibold">Liaison Assistant</h1>
          <span class="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs">🔒 Runs on this computer only</span>
        </div>
      </header>
      <main class="mx-auto max-w-3xl px-4 py-6">
        <SpeedTest />
      </main>
    </div>
  );
}
