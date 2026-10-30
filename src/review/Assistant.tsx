import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ArrowUp, Info, LoaderCircle, MessageSquarePlus, Sparkles } from 'lucide-preact';
import { useI18n, type Key } from '../i18n';

export type ChatEntry = { role: 'user' | 'assistant'; say: string; proposal?: 'shown' | 'setAside'; failed?: boolean };

const STARTERS: Key[] = ['chat.starter.polite', 'chat.starter.requestFirst', 'chat.starter.shorter', 'chat.starter.warmer'];

/**
 * The assistant panel: a short conversation about the text. Proposals open side by side with the text
 * (nothing changes until the person accepts). Not saved anywhere; "New conversation" clears it.
 */
export function Assistant({
  entries,
  busy,
  disabled,
  status,
  onSend,
  onReset,
}: {
  entries: ChatEntry[];
  /** What the assistant is saying so far, while it answers. */
  busy: { say: string; writing: boolean } | null;
  disabled: boolean;
  status?: ComponentChildren;
  onSend: (message: string) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length, busy?.say]);

  function send(text: string) {
    if (!text.trim() || busy || disabled) return;
    onSend(text.trim());
    setInput('');
  }

  return (
    <section class="flex max-h-[calc(100vh-7rem)] min-h-[420px] flex-col rounded-xl border border-line bg-surface shadow-card lg:sticky lg:top-4">
      <div class="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Sparkles size={16} class="text-brand" aria-hidden="true" />
        <h3 class="font-medium">{t('chat.title')}</h3>
        <span class="ml-auto flex items-center gap-1">
          {status}
          {entries.length > 0 && (
            <button
              type="button"
              class="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
              onClick={onReset}
              disabled={!!busy}
              title={t('chat.new')}
              aria-label={t('chat.new')}
            >
              <MessageSquarePlus size={16} />
            </button>
          )}
        </span>
      </div>

      <div ref={list} class="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
        {entries.length === 0 && !busy ? (
          <div>
            <p class="text-muted">{t('chat.intro')}</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              {STARTERS.map((k) => (
                <button
                  type="button"
                  class="rounded-full border border-line px-3 py-1 text-[13px] text-ink hover:border-brand/40 hover:bg-brand-soft/40 disabled:opacity-50"
                  onClick={() => send(t(k))}
                  disabled={disabled}
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          entries.map((e) => <Bubble entry={e} />)
        )}
        {busy && (
          <div class="flex items-start gap-2 text-ink">
            <LoaderCircle size={15} class="mt-0.5 shrink-0 animate-spin text-brand" aria-hidden="true" />
            <span>{busy.say || (busy.writing ? t('chat.writing') : t('chat.thinking'))}</span>
          </div>
        )}
      </div>

      <form
        class="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div class="flex items-end gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft">
          <textarea
            rows={2}
            class="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm outline-none"
            placeholder={t('chat.placeholder')}
            value={input}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={disabled}
          />
          <button
            type="submit"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-white hover:brightness-110 disabled:opacity-40"
            disabled={!input.trim() || !!busy || disabled}
            aria-label={t('chat.send')}
          >
            <ArrowUp size={16} />
          </button>
        </div>
        <p class="mt-2 text-[11px] text-muted">{t('chat.private')}</p>
      </form>
    </section>
  );
}

function Bubble({ entry }: { entry: ChatEntry }) {
  const { t } = useI18n();
  if (entry.role === 'user') {
    return (
      <div class="flex justify-end">
        <p class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-soft px-3 py-2 text-ink">{entry.say}</p>
      </div>
    );
  }
  return (
    <div class="space-y-1.5">
      {entry.say && <p class="whitespace-pre-wrap text-ink">{entry.say}</p>}
      {entry.proposal === 'shown' && <p class="text-xs font-medium text-brand">{t('chat.proposalShown')}</p>}
      {(entry.proposal === 'setAside' || entry.failed) && (
        <p class="flex items-start gap-1.5 text-xs text-warn">
          <Info size={13} class="mt-px shrink-0" aria-hidden="true" /> {t(entry.failed ? 'chat.failed' : 'chat.setAside')}
        </p>
      )}
    </div>
  );
}
