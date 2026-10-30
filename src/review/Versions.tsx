import { useEffect, useRef, useState } from 'preact/hooks';
import { History, RotateCcw } from 'lucide-preact';
import { useI18n } from '../i18n';

/** One saved state of the text, with what produced it ("More professional", "Your edits"…). */
export type Version = { id: number; title: string; at: number; text: string };

/**
 * "Versions" button and list: every version of the text made in this session, newest first,
 * with its title and time. Clicking one brings it back (the current text is kept as a version too).
 * Kept in memory only, like the draft: closing the tab erases them.
 */
export function VersionsMenu({
  versions: saved,
  current,
  editsTitle,
  onRestore,
}: {
  versions: Version[];
  current: string;
  /** Title for the text on screen when it was typed after the last version ("Your edits"). */
  editsTitle: string;
  onRestore: (v: Version) => void;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', onDown);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('mousedown', onDown);
      removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Typed since the last version: shown on top as the current one (it becomes a version at the next change).
  const typed = saved.length > 0 && current.trim() && saved.at(-1)!.text !== current;
  const versions = typed ? [...saved, { id: -1, title: editsTitle, at: Date.now(), text: current }] : saved;
  const today = new Date().toDateString();
  const when = (at: number) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      ...(new Date(at).toDateString() === today ? {} : { month: 'short', day: 'numeric' }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  // The newest version matching the text on screen is the current one.
  const currentId = [...versions].reverse().find((v) => v.text === current)?.id;

  return (
    <div ref={box} class="relative">
      <button
        type="button"
        class={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
          open ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas hover:text-ink'
        }`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <History size={16} aria-hidden="true" /> {t('versions.button')}
        {saved.length > 0 && <span class="rounded-full bg-canvas px-1.5 text-xs text-muted">{versions.length}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label={t('versions.title')} class="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-2 shadow-card">
          <p class="px-2 pb-2 pt-1 text-sm font-semibold">{t('versions.title')}</p>
          {versions.length === 0 ? (
            <p class="px-2 pb-2 text-sm text-muted">{t('versions.empty')}</p>
          ) : (
            <ul class="max-h-80 space-y-0.5 overflow-y-auto">
              {[...versions].reverse().map((v) => {
                const isCurrent = v.id === currentId;
                return (
                  <li>
                    <button
                      type="button"
                      class={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        isCurrent ? 'bg-brand-soft/60 ring-1 ring-inset ring-brand/25' : 'hover:bg-canvas'
                      }`}
                      onClick={() => {
                        if (!isCurrent) onRestore(v);
                        setOpen(false);
                      }}
                    >
                      <span class="min-w-0 flex-1 truncate font-medium text-ink">{v.title}</span>
                      {isCurrent ? (
                        <span class="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white">{t('versions.current')}</span>
                      ) : (
                        <span class="hidden items-center gap-1 text-xs font-medium text-brand group-hover:inline-flex">
                          <RotateCcw size={12} aria-hidden="true" /> {t('versions.restore')}
                        </span>
                      )}
                      <span class={`shrink-0 text-xs text-muted ${isCurrent ? '' : 'group-hover:hidden'}`}>{when(v.at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p class="border-t border-line px-2 pb-1 pt-2 text-[11px] text-muted">{t('versions.note')}</p>
        </div>
      )}
    </div>
  );
}
