import { useEffect } from 'preact/hooks';
import { PenLine, X } from 'lucide-preact';
import { useI18n } from '../i18n';
import { style, useStyle } from './store';

/**
 * After an email is copied (it's done, and it's how the person writes): offer to keep it as an example
 * of their style. The first time, this is also how they discover the feature. Disappears on its own.
 */
export function StyleOffer({ text, onDone, onDecline }: { text: string; onDone: () => void; onDecline: () => void }) {
  const { t } = useI18n();
  const data = useStyle();
  useEffect(() => {
    const timer = setTimeout(onDone, 15000);
    return () => clearTimeout(timer);
  }, [text]);

  const first = !data.enabled && data.examples.length === 0;
  return (
    <div role="status" class="fade-up fixed bottom-5 left-1/2 z-40 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <PenLine size={17} aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1 text-sm">
        <p class="font-medium text-ink">{t(first ? 'style.offer.firstTitle' : 'style.offer.title')}</p>
        <p class="mt-0.5 text-muted">{t(first ? 'style.offer.firstText' : 'style.offer.text')}</p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
            onClick={() => {
              style.add(text);
              onDone();
            }}
          >
            {t(first ? 'style.offer.firstYes' : 'style.offer.yes')}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
            onClick={() => {
              onDecline();
              onDone();
            }}
          >
            {t('style.offer.no')}
          </button>
        </div>
      </div>
      <button type="button" class="rounded p-0.5 text-muted hover:text-ink" onClick={onDone} aria-label={t('check.close')}>
        <X size={16} />
      </button>
    </div>
  );
}
