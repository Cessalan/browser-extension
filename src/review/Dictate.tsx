import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { LoaderCircle, Mic, Square } from 'lucide-preact';
import { Button } from '../ui';
import { useI18n, type Key } from '../i18n';
import { startRecording, voice, type Recording } from '../voice/voice';
import { insertionText, isSilent } from '../voice/transcript';

type State =
  | { kind: 'idle'; note?: Key }
  | { kind: 'listening'; since: number }
  | { kind: 'working'; download: number | null };

/** Long enough for a full email; stops a forgotten microphone. */
const MAX_SECONDS = 5 * 60;

/** Voice typing: records, transcribes on this computer, and types the words at the cursor. */
export function Dictate({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const { lang, t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, tick] = useState(0);
  const recording = useRef<Recording | null>(null);

  // Releases the microphone if the editor goes away mid-dictation.
  useEffect(() => () => recording.current?.cancel(), []);

  useEffect(() => {
    if (state.kind !== 'listening') return;
    const id = setInterval(() => {
      if ((Date.now() - state.since) / 1000 >= MAX_SECONDS) void stop();
      else tick((n) => n + 1);
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  async function start() {
    try {
      recording.current = await startRecording();
      setState({ kind: 'listening', since: Date.now() });
    } catch (err) {
      console.error(err);
      const name = err instanceof DOMException ? err.name : '';
      setState({ kind: 'idle', note: name === 'NotAllowedError' ? 'voice.blocked' : name === 'NotFoundError' ? 'voice.noMic' : 'voice.failed' });
    }
  }

  async function stop() {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    setState({ kind: 'working', download: null });
    try {
      const audio = await rec.stop();
      if (isSilent(audio)) return setState({ kind: 'idle', note: 'voice.nothing' });
      const text = await voice.transcribe(audio, lang, (stage, fraction) =>
        setState({ kind: 'working', download: stage === 'download' ? fraction : null }),
      );
      setState({ kind: 'idle', note: type(text) ? undefined : 'voice.nothing' });
    } catch (err) {
      console.error(err);
      setState({ kind: 'idle', note: 'voice.failed' });
    }
  }

  /** Types `transcript` at the cursor (or at the end if the user never placed one). Returns false if nothing was said. */
  function type(transcript: string): boolean {
    if (!editor) return false;
    const { from } = editor.state.selection;
    const atEnd = from <= 1 && editor.getText().trim().length > 0;
    const pos = atEnd ? editor.state.doc.content.size - 1 : from;
    const text = insertionText(editor.state.doc.textBetween(Math.max(0, pos - 1), pos, '\n'), transcript);
    if (!text) return false;
    editor.chain().focus(atEnd ? 'end' : undefined).insertContent(text).run();
    return true;
  }

  if (state.kind === 'listening') {
    const s = Math.floor((Date.now() - state.since) / 1000);
    return (
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted" aria-live="polite">
          <span class="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          {t('voice.listening', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })}
        </span>
        <Button variant="secondary" icon={Square} onClick={() => void stop()}>
          {t('voice.stop')}
        </Button>
      </div>
    );
  }

  if (state.kind === 'working') {
    return (
      <span class="flex items-center gap-2 whitespace-nowrap px-2 text-xs text-muted" aria-live="polite">
        <LoaderCircle size={15} class="animate-spin text-brand" aria-hidden="true" />
        {state.download !== null ? t('voice.download', { pct: Math.round(state.download * 100) }) : t('voice.working')}
      </span>
    );
  }

  return (
    <div class="flex items-center gap-2">
      {state.note && <span class="text-xs text-muted" aria-live="polite">{t(state.note)}</span>}
      <Button variant="ghost" icon={Mic} onClick={() => void start()} disabled={disabled || !editor} title={t('voice.dictateTitle')}>
        {t('voice.dictate')}
      </Button>
    </div>
  );
}
