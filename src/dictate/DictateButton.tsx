import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { Loader2, Mic, Sparkles, Square } from 'lucide-preact';
import { useI18n } from '../i18n';
import { dictationSupported, startDictation, type DictateSession, type DictateState } from './dictate';

/** "Dictate" button: speech becomes text at the cursor. Everything runs on this computer. */
export function DictateButton({ editor, lang }: { editor: Editor | null; lang: 'fr' | 'en' }) {
  const { t } = useI18n();
  const [state, setState] = useState<DictateState>({ phase: 'idle' });
  const [error, setError] = useState(false);
  const session = useRef<DictateSession | null>(null);
  useEffect(() => () => session.current?.stop(), []);
  if (!dictationSupported()) return null;

  function insert(text: string) {
    if (!editor) return;
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from);
    editor.chain().focus().insertContent((before && !/\s/.test(before) ? ' ' : '') + text).run();
  }

  async function click() {
    if (state.phase === 'listening') return session.current?.stop();
    if (state.phase !== 'idle') return;
    setError(false);
    try {
      session.current = await startDictation({ lang, onState: setState, onText: insert, onError: () => setError(true) });
    } catch {
      setError(true);
      setState({ phase: 'idle' });
    }
  }

  const busy = state.phase === 'preparing' || state.phase === 'transcribing';
  const label =
    state.phase === 'listening' ? t('dictate.stop')
    : state.phase === 'transcribing' ? t('dictate.transcribing')
    : state.phase === 'preparing' ? (state.fraction ? t('dictate.downloading', { p: Math.round(state.fraction * 100) }) : t('dictate.preparing'))
    : t('dictate.start');
  const Icon = state.phase === 'listening' ? Square : busy ? Loader2 : Mic;

  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={busy || !editor}
      title={error ? t('dictate.error') : t('dictate.title')}
      class={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-wait ${
        state.phase === 'listening' ? 'bg-red-50 text-bad' : error ? 'text-bad hover:bg-canvas' : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      <Icon size={16} aria-hidden="true" class={busy ? 'animate-spin' : state.phase === 'listening' ? 'animate-pulse' : ''} />
      {label}
      {state.phase === 'idle' && <Sparkles size={12} class="-ml-0.5 -mt-2 text-brand" aria-hidden="true" />}
    </button>
  );
}
