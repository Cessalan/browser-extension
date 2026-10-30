import { useEffect, useState } from 'preact/hooks';
import { Plus, Trash2, X } from 'lucide-preact';
import { useI18n } from '../i18n';
import { Button } from '../ui';
import { style, useStyle } from './store';
import { MAX_EXAMPLES, buildProfile } from './style';

/**
 * "My style": turn learning on or off, see what Confi has learned and every saved example
 * (already anonymized), add one by pasting it, delete one or all.
 */
export function StylePanel({ onClose }: { onClose: () => void }) {
  const { lang, t } = useI18n();
  const data = useStyle();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [tooShort, setTooShort] = useState(false);
  const profile = buildProfile(data.examples);
  const habits = [
    profile.greeting && t('style.habit.greeting', { v: profile.greeting }),
    profile.signoff && t('style.habit.signoff', { v: profile.signoff }),
    profile.formality && t(profile.formality === 'vous' ? 'style.habit.vous' : 'style.habit.tu'),
    profile.sentences && t(profile.sentences === 'short' ? 'style.habit.short' : 'style.habit.long'),
  ].filter(Boolean) as string[];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  function save() {
    if (!style.add(draft)) return setTooShort(true);
    setDraft('');
    setAdding(false);
    setTooShort(false);
  }

  const date = (at: number) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' }).format(at);

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={t('style.title')} class="fade-up w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-card">
        <div class="flex items-start gap-3 border-b border-line px-6 py-5">
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold tracking-tight">{t('style.title')}</h2>
            <p class="mt-1 text-sm text-muted">{t('style.intro')}</p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" onClick={onClose} aria-label={t('check.close')}>
            <X size={18} />
          </button>
        </div>

        <div class="space-y-5 px-6 py-5">
          <label class="flex cursor-pointer items-center gap-3">
            <span class="relative inline-flex">
              <input type="checkbox" class="peer sr-only" checked={data.enabled} onChange={(e) => style.setEnabled(e.currentTarget.checked)} />
              <span class="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-brand" />
              <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </span>
            <span class="font-medium">{t('style.toggle')}</span>
          </label>

          {habits.length > 0 && (
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted">{t('style.learned')}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                {habits.map((h) => (
                  <span class="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand-strong">{h}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div class="flex items-center gap-2">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">{t('style.examples', { n: data.examples.length, max: MAX_EXAMPLES })}</p>
              {data.examples.length > 0 && (
                <button type="button" class="ml-auto text-xs text-muted hover:text-bad" onClick={() => confirm(t('style.clearConfirm')) && style.clear()}>
                  {t('style.clear')}
                </button>
              )}
            </div>
            {data.examples.length === 0 && !adding && <p class="mt-2 text-sm text-muted">{t('style.empty')}</p>}
            <ul class="mt-2 space-y-2">
              {[...data.examples].reverse().map((e) => (
                <li class="group flex gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                  {/* One flowing preview: blank lines between paragraphs would hide everything after the greeting. */}
                  <p class="line-clamp-2 min-w-0 flex-1 text-ink/80">{e.text.replace(/\s*\n+\s*/g, ' · ')}</p>
                  <span class="shrink-0 text-xs text-muted">{date(e.at)}</span>
                  <button type="button" class="shrink-0 self-start rounded p-0.5 text-muted opacity-60 hover:text-bad group-hover:opacity-100" onClick={() => style.remove(e.id)} aria-label={t('style.remove')} title={t('style.remove')}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
            {adding ? (
              <div class="mt-3">
                <textarea
                  class="h-36 w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
                  placeholder={t('style.pastePlaceholder')}
                  value={draft}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  autofocus
                />
                {tooShort && <p class="mt-1 text-xs text-warn">{t('style.tooShort')}</p>}
                <div class="mt-2 flex gap-2">
                  <Button onClick={save} disabled={!draft.trim()}>{t('style.save')}</Button>
                  <Button variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>{t('compare.cancel')}</Button>
                </div>
              </div>
            ) : (
              <button type="button" class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline" onClick={() => setAdding(true)}>
                <Plus size={15} aria-hidden="true" /> {t('style.add')}
              </button>
            )}
          </div>
        </div>

        <p class="rounded-b-2xl border-t border-line bg-canvas px-6 py-3 text-xs text-muted">{t('style.privacy')}</p>
      </section>
    </div>
  );
}
