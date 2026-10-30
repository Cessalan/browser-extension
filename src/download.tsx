import { useEffect, useState } from 'preact/hooks';
import { Download, Lock, Sparkles, WifiOff } from 'lucide-preact';
import type { LucideIcon } from 'lucide-preact';
import { useI18n, type Key } from './i18n';

/** What to say while the AI downloads, in turn: what's happening, then why it's worth the wait. */
const STEPS: { key: Key; chromeKey?: Key; icon: LucideIcon }[] = [
  { key: 'download.msg.downloading', chromeKey: 'download.msg.chrome', icon: Download },
  { key: 'download.msg.private', icon: Lock },
  { key: 'download.msg.offline', icon: WifiOff },
];

/**
 * The AI download: a pulsing icon, a message that changes every few seconds, a bar with a sweeping
 * light (and a moving glow before the first bytes arrive), and how much is done.
 */
export function DownloadProgress({ fraction, sizeMB, byChrome = false }: { fraction: number; sizeMB?: number; byChrome?: boolean }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => s + 1), 3500);
    return () => clearInterval(timer);
  }, []);

  const pct = Math.round(fraction * 100);
  // At the very end the files are downloaded and the AI is being set up.
  const finishing = fraction >= 0.97;
  const current = STEPS[step % STEPS.length];
  const Icon = finishing ? Sparkles : current.icon;
  const message = finishing ? t('download.msg.finishing') : t(byChrome && current.chromeKey ? current.chromeKey : current.key);
  const amount = sizeMB && !byChrome ? `${Math.round(fraction * sizeMB)} / ${sizeMB} ${t('setup.mb')}` : `${pct} %`;

  return (
    <div role="status" aria-live="polite">
      <div class="flex items-center gap-3">
        <span class="pulse-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Icon size={18} aria-hidden="true" />
        </span>
        <p key={finishing ? 'finishing' : step} class="fade-up min-w-0 flex-1 text-sm font-medium text-ink">
          {message}
        </p>
        <span class="shrink-0 text-sm tabular-nums text-muted">{amount}</span>
      </div>
      <div class={`relative mt-3 h-2.5 overflow-hidden rounded-full bg-brand-soft ${fraction < 0.02 ? 'progress-wait' : ''}`}>
        <div
          class="progress-shine h-full rounded-full bg-gradient-to-r from-sky-400 to-brand transition-[width] duration-500"
          style={{ width: `${Math.max(fraction, 0.02) * 100}%` }}
        />
      </div>
    </div>
  );
}
