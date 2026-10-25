import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ai, useAiStatus, type AiStatus, type Message } from '../ai/engine';
import { Button } from '../ui';
import { findSensitive, type SensitiveMatch } from './sensitive';
import { REWRITES, cleanRewrite, parseBullets, reviewMessages, rewriteMessages, type RewriteId } from './prompts';
import { countChanges, diffWords, type DiffPart } from './diff';

// Made-up example. Never use real patient data here.
const EXAMPLE = `Hi Dr. Patel,

following up on pt we discussed tuesday, they r ready for d/c to rehab friday pending final PT eval. can u confirm orders are signed? family asked about transport i said we would call back. MRN 00482913

thx
Jordan`;

type Review = { kind: 'review'; text: string; done: boolean; forDraft: string; startedAt: number };
type Rewrite = { kind: 'rewrite'; id: RewriteId; label: string; original: string; text: string; done: boolean; startedAt: number };
type Task = Review | Rewrite;

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

  function review() {
    if (!draft.trim() || running) return;
    void run({ kind: 'review', text: '', done: false, forDraft: draft, startedAt: Date.now() }, reviewMessages(draft));
  }

  function rewrite(id: RewriteId, original = draft) {
    const { label } = REWRITES.find((r) => r.id === id)!;
    void run({ kind: 'rewrite', id, label, original, text: '', done: false, startedAt: Date.now() }, rewriteMessages(id, original));
  }

  async function copy() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canAct = draft.trim().length > 0 && !running;

  return (
    <div class="space-y-4">
      {/* Toolbar */}
      <div class="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-sm">
        <Button onClick={review} disabled={!canAct} title="Ctrl + Enter">
          ✓ Check my email
        </Button>
        <span class="mx-1 hidden h-6 w-px bg-line sm:block" />
        <span class="px-1 text-xs font-medium uppercase tracking-wide text-muted">Rewrite</span>
        {REWRITES.map((r) => (
          <Button key={r.id} variant="secondary" onClick={() => rewrite(r.id)} disabled={!canAct}>
            {r.label}
          </Button>
        ))}
        <div class="ml-auto">
          <AiPill status={status} />
        </div>
      </div>

      {sensitive.length > 0 && <SensitiveBar matches={sensitive} />}
      {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {task?.kind === 'rewrite' ? (
        <Compare
          task={task}
          status={status}
          onChange={(text) => setTask({ ...task, text })}
          onUse={() => { replaceDraft(task.text); setTask(null); }}
          onRetry={() => rewrite(task.id, task.original)}
          onDiscard={() => setTask(null)}
        />
      ) : (
        <div class={`grid items-start gap-4 ${task ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <section class="rounded-lg border border-line bg-surface shadow-sm">
            <div class="flex items-center gap-2 border-b border-line px-4 py-2">
              <h3 class="font-medium">Your email</h3>
              <span class="text-xs text-muted">{words} words</span>
              <div class="ml-auto flex gap-1">
                <Button variant="ghost" onClick={() => { setDraft(history.at(-1) ?? ''); setHistory((h) => h.slice(0, -1)); }} disabled={!history.length} title="Undo last change">
                  ↶ Undo
                </Button>
                <Button variant="ghost" onClick={() => { replaceDraft(''); setTask(null); }} disabled={!draft}>
                  Clear
                </Button>
              </div>
            </div>
            <textarea
              ref={editor}
              class="block min-h-[420px] w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none"
              placeholder="Paste or type your email here…"
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) review();
              }}
              spellcheck
            />
            <div class="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
              <Button onClick={copy} disabled={!draft.trim()}>
                {copied ? 'Copied ✓' : 'Copy to send'}
              </Button>
              {!draft && (
                <button type="button" class="text-sm text-brand underline" onClick={() => { setDraft(EXAMPLE); editor.current?.focus(); }}>
                  Try with an example
                </button>
              )}
              <span class="ml-auto text-xs text-muted">Not saved. Closing the tab clears it.</span>
            </div>
          </section>

          {task?.kind === 'review' && (
            <ReviewPanel task={task} status={status} stale={task.forDraft !== draft} onClose={() => setTask(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function Compare({
  task,
  status,
  onChange,
  onUse,
  onRetry,
  onDiscard,
}: {
  task: Rewrite;
  status: AiStatus;
  onChange: (text: string) => void;
  onUse: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const parts = useMemo(() => (task.done ? diffWords(task.original, task.text) : null), [task.done, task.original, task.text]);
  const changes = parts && countChanges(parts);

  return (
    <section class="rounded-lg border border-line bg-surface shadow-sm">
      <div class="grid md:grid-cols-2">
        <div class="border-b border-line md:border-b-0 md:border-r">
          <PaneHeader title="Your email" hint={parts ? 'Removed text in red' : undefined} />
          <div class="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">
            {parts ? <DiffText parts={parts} side="before" /> : task.original}
          </div>
        </div>
        <div class="bg-brand-soft/30">
          <PaneHeader title={`Suggestion: ${task.label}`} hint={parts && !editing ? 'Added text in green' : undefined} />
          {editing ? (
            <textarea
              class="block min-h-[300px] w-full resize-y bg-surface p-4 text-[15px] leading-relaxed outline-none ring-2 ring-inset ring-brand/40"
              value={task.text}
              onInput={(e) => onChange(e.currentTarget.value)}
              autoFocus
            />
          ) : (
            <div class="min-h-[300px] whitespace-pre-wrap p-4 text-[15px] leading-relaxed">
              {parts ? <DiffText parts={parts} side="after" /> : <Streaming text={task.text} startedAt={task.startedAt} status={status} />}
            </div>
          )}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {task.done ? (
          <>
            <Button onClick={onUse}>Use this version</Button>
            <Button variant="secondary" onClick={() => setEditing(!editing)}>{editing ? 'Show changes' : 'Edit'}</Button>
            <Button variant="secondary" onClick={onRetry}>Try again</Button>
            <Button variant="ghost" onClick={onDiscard}>Keep mine</Button>
            {changes && (
              <span class="ml-auto text-xs text-muted">
                <span class="text-good">+{changes.added}</span> / <span class="text-bad">−{changes.removed}</span> words
              </span>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void ai.stop()}>Stop</Button>
            <Button variant="ghost" onClick={() => { void ai.stop(); onDiscard(); }}>Cancel</Button>
          </>
        )}
      </div>
    </section>
  );
}

function PaneHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div class="flex items-center gap-2 border-b border-line px-4 py-2">
      <h3 class="font-medium">{title}</h3>
      {hint && <span class="ml-auto text-xs text-muted">{hint}</span>}
    </div>
  );
}

function DiffText({ parts, side }: { parts: DiffPart[]; side: 'before' | 'after' }) {
  return (
    <>
      {parts.map((p) => {
        if (p.type === 'same') return p.text;
        const shown = (p.type === 'del' && side === 'before') || (p.type === 'add' && side === 'after');
        if (!shown) return null;
        // Keep trailing spaces outside the highlight so it hugs the words.
        const [, words, space] = /^([\s\S]*?)(\s*)$/.exec(p.text)!;
        return (
          <>
            {p.type === 'del' ? (
              <del class="rounded bg-red-100 px-0.5 text-bad decoration-red-400">{words}</del>
            ) : (
              <ins class="rounded bg-green-100 px-0.5 text-good no-underline">{words}</ins>
            )}
            {space}
          </>
        );
      })}
    </>
  );
}

/** What the user sees while the AI works: model loading, then "thinking", then text appearing. */
function Streaming({ text, startedAt, status }: { text: string; startedAt: number; status: AiStatus }) {
  const seconds = useElapsed(startedAt);
  if (status.state === 'loading') {
    return (
      <div class="space-y-2 text-sm">
        <p>Starting the AI… {Math.round(status.fraction * 100)}%</p>
        <div class="h-1.5 overflow-hidden rounded-full bg-brand-soft">
          <div class="h-full bg-brand transition-all" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
        </div>
        <p class="text-xs text-muted">First time only. After this it starts in seconds.</p>
      </div>
    );
  }
  if (!text) {
    return (
      <div>
        <p class="mb-3 flex items-center gap-2 text-sm text-muted">
          <Spinner /> Writing… {seconds}s
        </p>
        <Skeleton />
      </div>
    );
  }
  return (
    <>
      {text}
      <span class="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-middle" />
    </>
  );
}

function ReviewPanel({ task, status, stale, onClose }: { task: Review; status: AiStatus; stale: boolean; onClose: () => void }) {
  const items = parseBullets(task.text);
  const seconds = useElapsed(task.startedAt);
  return (
    <section class="rounded-lg border border-line bg-surface shadow-sm">
      <div class="flex items-center gap-2 border-b border-line px-4 py-2">
        <h3 class="font-medium">Check results</h3>
        <button type="button" class="ml-auto text-muted hover:text-ink" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div class="p-4">
        {status.state === 'loading' ? (
          <Streaming text="" startedAt={task.startedAt} status={status} />
        ) : items.length === 0 && !task.done ? (
          <>
            <p class="mb-3 flex items-center gap-2 text-sm text-muted">
              <Spinner /> Reading your email… {seconds}s
            </p>
            <Skeleton lines={3} />
          </>
        ) : (
          <ul class="space-y-2 text-sm">
            {items.map((item) => (
              <li class="flex gap-2 rounded-md bg-canvas p-2">
                <span class="text-warn">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {task.done && stale && <p class="mt-3 text-xs text-warn">You've edited the email since this check.</p>}
        {!task.done && status.state !== 'loading' && (
          <div class="mt-3">
            <Button variant="ghost" onClick={() => void ai.stop()}>Stop</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function SensitiveBar({ matches }: { matches: SensitiveMatch[] }) {
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm">
      <span class="font-medium text-warn">⚠ Patient details found</span>
      <span class="text-xs text-muted">Send through secure email, or remove them:</span>
      {matches.map((m) => (
        <span class="rounded-full border border-amber-300 bg-surface px-2 py-0.5 text-xs" title={m.kind}>
          {m.kind}: <code class="font-mono">{m.text}</code>
        </span>
      ))}
    </div>
  );
}

function AiPill({ status }: { status: AiStatus }) {
  const pill = 'flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs';
  switch (status.state) {
    case 'ready':
      return (
        <span class={pill}>
          <span class="h-2 w-2 rounded-full bg-good" /> AI ready · on this computer
        </span>
      );
    case 'loading':
      return (
        <span class={pill}>
          <Spinner /> AI starting {Math.round(status.fraction * 100)}%
        </span>
      );
    case 'error':
      return (
        <button type="button" class={`${pill} border-red-200 bg-red-50 text-bad`} title={status.message} onClick={() => void ai.load().catch(() => {})}>
          AI couldn't start · Retry
        </button>
      );
    default:
      return status.cached === false ? (
        <button type="button" class={`${pill} hover:bg-canvas`} onClick={() => void ai.load().catch(() => {})}>
          ⬇ Download AI (~700 MB, once)
        </button>
      ) : (
        <span class={`${pill} text-muted`}>Checking AI…</span>
      );
  }
}

function Spinner() {
  return <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
}

function Skeleton({ lines = 6 }: { lines?: number }) {
  const widths = ['w-11/12', 'w-full', 'w-10/12', 'w-9/12', 'w-full', 'w-7/12'];
  return (
    <div class="animate-pulse space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <div class={`h-3 rounded bg-line ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}
