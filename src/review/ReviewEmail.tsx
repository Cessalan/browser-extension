import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ai, useAiStatus, type AiStatus, type Message } from '../ai/engine';
import { Button, Card } from '../ui';
import { findSensitive } from './sensitive';
import { REWRITES, cleanRewrite, parseBullets, reviewMessages, rewriteMessages, type RewriteId } from './prompts';

// Made-up example. Never use real patient data here.
const EXAMPLE = `Hi Dr. Patel,

following up on pt we discussed tuesday, they r ready for d/c to rehab friday pending final PT eval. can u confirm orders are signed? family asked about transport i said we would call back. MRN 00482913

thx
Jordan`;

type Task =
  | { kind: 'review'; text: string; done: boolean; forDraft: string }
  | { kind: 'rewrite'; label: string; text: string; done: boolean };

export function ReviewEmail() {
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = useAiStatus();
  const editor = useRef<HTMLTextAreaElement>(null);

  const sensitive = useMemo(() => findSensitive(draft), [draft]);
  const running = task !== null && !task.done;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  // Warm up the model in the background if it's already downloaded.
  useEffect(() => {
    if (status.state === 'idle' && status.cached) void ai.load().catch(() => {});
  }, [status]);

  function replaceDraft(next: string) {
    setHistory((h) => [...h.slice(-19), draft]);
    setDraft(next);
  }

  async function run(next: Task, messages: Message[]) {
    setError(null);
    setTask(next);
    try {
      const text = await ai.generate(messages, (t) => setTask((cur) => cur && { ...cur, text: t }));
      setTask((cur) => cur && { ...cur, text: cur.kind === 'rewrite' ? cleanRewrite(text) : text, done: true });
    } catch (err) {
      setTask(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const review = () => {
    if (!draft.trim() || running) return;
    void run({ kind: 'review', text: '', done: false, forDraft: draft }, reviewMessages(draft));
  };
  const rewrite = (id: RewriteId, label: string) =>
    void run({ kind: 'rewrite', label, text: '', done: false }, rewriteMessages(id, draft));

  async function copy() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card
        title="Your email"
        actions={
          <>
            <Button variant="ghost" onClick={() => { setDraft(history.at(-1) ?? ''); setHistory((h) => h.slice(0, -1)); }} disabled={!history.length || running} title="Undo last change">
              ↶ Undo
            </Button>
            <Button variant="ghost" onClick={() => { replaceDraft(''); setTask(null); }} disabled={!draft || running}>
              Clear
            </Button>
          </>
        }
      >
        <textarea
          ref={editor}
          class="block min-h-[360px] w-full resize-y rounded-md border border-line bg-surface p-3 text-[15px] leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft read-only:bg-canvas"
          placeholder="Paste or type your email here…"
          value={draft}
          readOnly={running && task?.kind === 'rewrite'}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) review();
          }}
          spellcheck
        />
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={copy} disabled={!draft.trim()}>
            {copied ? 'Copied ✓' : 'Copy to send'}
          </Button>
          <span class="text-xs text-muted">{words} words</span>
          {!draft && (
            <button type="button" class="text-xs text-brand underline" onClick={() => { setDraft(EXAMPLE); editor.current?.focus(); }}>
              Try with an example
            </button>
          )}
          <span class="ml-auto text-xs text-muted">Not saved. Closing the tab clears it.</span>
        </div>
      </Card>

      <div class="space-y-4">
        <AiStatusBar status={status} />

        <SensitivePanel matches={sensitive} />

        <Card title="Check">
          <Button onClick={review} disabled={!draft.trim() || running}>
            Check my email
          </Button>
          <span class="ml-2 text-xs text-muted">Ctrl + Enter</span>
          {task?.kind === 'review' && <ReviewResult task={task} stale={task.forDraft !== draft} />}
        </Card>

        <Card title="Rewrite">
          <div class="grid grid-cols-2 gap-2">
            {REWRITES.map((r) => (
              <Button key={r.id} variant="secondary" onClick={() => rewrite(r.id, r.label)} disabled={!draft.trim() || running}>
                {r.label}
              </Button>
            ))}
          </div>
        </Card>

        {task?.kind === 'rewrite' && (
          <Card title={`Suggestion: ${task.label}`}>
            <textarea
              class="block min-h-[220px] w-full resize-y rounded-md border border-line bg-canvas p-2 text-sm leading-relaxed outline-none focus:border-brand"
              value={task.text}
              readOnly={!task.done}
              onInput={(e) => setTask({ ...task, text: e.currentTarget.value })}
            />
            <div class="mt-2 flex gap-2">
              {task.done ? (
                <>
                  <Button onClick={() => { replaceDraft(task.text); setTask(null); }}>Use this</Button>
                  <Button variant="secondary" onClick={() => setTask(null)}>Discard</Button>
                  <span class="self-center text-xs text-muted">You can edit it first.</span>
                </>
              ) : (
                <Button variant="secondary" onClick={() => void ai.stop()}>Stop</Button>
              )}
            </div>
          </Card>
        )}

        {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}

function ReviewResult({ task, stale }: { task: Extract<Task, { kind: 'review' }>; stale: boolean }) {
  const items = parseBullets(task.text);
  return (
    <div class="mt-3">
      {items.length === 0 && !task.done ? (
        <p class="text-sm text-muted">Reading your email…</p>
      ) : (
        <ul class="space-y-1.5 text-sm">
          {items.map((item) => (
            <li class="flex gap-2">
              <span class="text-brand">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {task.done && stale && <p class="mt-2 text-xs text-warn">You've edited the email since this check.</p>}
      {!task.done && (
        <Button variant="ghost" onClick={() => void ai.stop()}>
          Stop
        </Button>
      )}
    </div>
  );
}

function SensitivePanel({ matches }: { matches: ReturnType<typeof findSensitive> }) {
  if (matches.length === 0) return null;
  return (
    <section class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <h3 class="font-medium text-warn">⚠ Patient details found</h3>
      <p class="mt-1 text-xs text-muted">Make sure you're sending this through secure email, or remove them.</p>
      <ul class="mt-2 space-y-1">
        {matches.map((m) => (
          <li class="flex justify-between gap-2">
            <span class="text-muted">{m.kind}</span>
            <code class="truncate font-mono text-xs">{m.text}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AiStatusBar({ status }: { status: AiStatus }) {
  const base = 'rounded-lg border border-line bg-surface px-4 py-3 text-sm';
  switch (status.state) {
    case 'ready':
      return (
        <div class={`${base} flex items-center gap-2`}>
          <span class="h-2 w-2 rounded-full bg-good" /> AI ready · running on this computer
        </div>
      );
    case 'loading':
      return (
        <div class={base}>
          <div class="flex justify-between">
            <span>Getting AI ready…</span>
            <span class="text-muted">{Math.round(status.fraction * 100)}%</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-soft">
            <div class="h-full bg-brand transition-all" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
          </div>
          <p class="mt-1 text-xs text-muted">One-time download. You can keep writing.</p>
        </div>
      );
    case 'error':
      return (
        <div class={`${base} border-red-200 bg-red-50 text-bad`}>
          AI couldn't start: {status.message}
          <div class="mt-2">
            <Button variant="secondary" onClick={() => void ai.load().catch(() => {})}>Try again</Button>
          </div>
        </div>
      );
    default:
      return (
        <div class={`${base} flex items-center gap-3`}>
          <span class="text-muted">{status.cached === null ? 'Checking AI…' : 'AI not downloaded yet (~700 MB, one time)'}</span>
          {status.cached === false && (
            <span class="ml-auto">
              <Button variant="secondary" onClick={() => void ai.load().catch(() => {})}>Download</Button>
            </span>
          )}
        </div>
      );
  }
}
