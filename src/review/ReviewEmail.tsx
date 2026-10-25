import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ai, useAiStatus, type AiStatus, type Message } from '../ai/engine';
import { Button } from '../ui';
import { useI18n, type Lang } from '../i18n';
import {
  Briefcase, Check, ClipboardCheck, Copy, Download, Eraser, Lightbulb, LoaderCircle, Pencil, RotateCcw,
  Scissors, ShieldAlert, Sparkles, SpellCheck, Square, Undo2, X, type LucideIcon,
} from 'lucide-preact';
import { findSensitive, type SensitiveMatch } from './sensitive';
import { REWRITES, cleanRewrite, customMessages, parseBullets, reviewMessages, rewriteMessages, type RewriteId } from './prompts';

const REWRITE_ICONS: Record<RewriteId, LucideIcon> = { clearer: Lightbulb, professional: Briefcase, shorter: Scissors, fix: SpellCheck };
import { countChanges, diffWords, type DiffPart } from './diff';
import { modeInfo } from '../speedtest/models';

// Made-up examples. Never use real patient data here.
const EXAMPLE_FR = `Bonjour Dre Tremblay,

suivi pour le pt dont on a parlé mardi, il est pret pour le congé vers la réadapt vendredi si l'eval en physio est ok. pouvez vous confirmer que les ordonnances sont signées? la famille demande pour le transport, j'ai dit qu'on les rappelerait. dossier 4482913

merci
Jordan`;

const EXAMPLES: Record<Lang, string> = { fr: EXAMPLE_FR, en: `Hi Dr. Patel,

following up on pt we discussed tuesday, they r ready for d/c to rehab friday pending final PT eval. can u confirm orders are signed? family asked about transport i said we would call back. MRN 00482913

thx
Jordan` };

type Review = { kind: 'review'; text: string; done: boolean; forDraft: string; startedAt: number };
type Rewrite = { kind: 'rewrite'; label: string; original: string; messages: Message[]; text: string; done: boolean; startedAt: number };
type Task = Review | Rewrite;

export function ReviewEmail() {
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState('');
  const status = useAiStatus();
  const { lang, t } = useI18n();
  const editor = useRef<HTMLTextAreaElement>(null);

  const sensitive = useMemo(() => findSensitive(draft), [draft]);
  const running = task !== null && !task.done;
  const words = countWords(draft);

  // Drafts are never saved, so warn before the tab closes with one in progress.
  useEffect(() => {
    if (!draft.trim()) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [draft.trim().length > 0]);

  // Shortcuts while a suggestion is shown: Ctrl+Enter uses it, Esc keeps the original.
  useEffect(() => {
    if (task?.kind !== 'rewrite' || !task.done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        replaceDraft(task.text);
        setTask(null);
      } else if (e.key === 'Escape') {
        setTask(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  /** Selects a flagged detail in the editor so the nurse can see or delete it. */
  const pendingSelection = useRef<SensitiveMatch | null>(null);
  function showMatch(m: SensitiveMatch) {
    pendingSelection.current = m;
    if (task?.kind === 'rewrite') setTask(null); // the editor is hidden behind the compare view
    else applySelection();
  }
  function applySelection() {
    const m = pendingSelection.current;
    const el = editor.current;
    if (!m || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(m.index, m.index + m.text.length);
  }
  useEffect(applySelection); // runs once the editor is back on screen

  // Warm up the model in the background if it's already downloaded.
  useEffect(() => {
    if (status.state === 'idle' && status.cached) void ai.load().catch(() => {});
  }, [status]);

  function replaceDraft(next: string) {
    setHistory((h) => [...h.slice(-19), draft]);
    setDraft(next);
  }

  async function run(next: Task, messages: Message[], maxTokens: number) {
    setError(null);
    setTask(next);
    try {
      const text = await ai.generate(messages, (t) => setTask((cur) => cur && { ...cur, text: t }), maxTokens);
      setTask((cur) => cur && { ...cur, text: cur.kind === 'rewrite' ? cleanRewrite(text) : text, done: true });
    } catch (err) {
      setTask(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function review() {
    if (!draft.trim() || running) return;
    void run({ kind: 'review', text: '', done: false, forDraft: draft, startedAt: Date.now() }, reviewMessages(draft, lang), 300);
  }

  /** `original` is what the diff compares against; `messages` may target a previous suggestion when refining. */
  function rewrite(label: string, original: string, messages: Message[]) {
    // A rewrite is about as long as its input; leave room so it never stops mid-sentence.
    const maxTokens = Math.min(2000, Math.max(300, countWords(String(messages.at(-1)?.content ?? '')) * 2 + 150));
    void run({ kind: 'rewrite', label, original, messages, text: '', done: false, startedAt: Date.now() }, messages, maxTokens);
  }

  // With a suggestion on screen, the instruction box refines that suggestion; otherwise it edits the draft.
  const refining = task?.kind === 'rewrite' && task.done;

  function applyInstruction() {
    const text = instruction.trim();
    if (!text || running) return;
    if (task?.kind === 'rewrite' && task.done) {
      // Keep diffing against the nurse's original email.
      rewrite(quote(text, lang), task.original, customMessages(text, task.text));
    } else if (draft.trim()) {
      rewrite(quote(text, lang), draft, customMessages(text, draft));
    } else {
      return;
    }
    setInstruction('');
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
        <Button onClick={review} disabled={!canAct} title="Ctrl + Enter" icon={ClipboardCheck}>
          {t('review.check')}
        </Button>
        <span class="mx-1 hidden h-6 w-px bg-line sm:block" />
        <span class="px-1 text-xs font-medium uppercase tracking-wide text-muted">{t('review.rewrite')}</span>
        {REWRITES.map((r) => (
          <Button key={r.id} variant="secondary" icon={REWRITE_ICONS[r.id]} onClick={() => rewrite(t(r.label), draft, rewriteMessages(r.id, draft))} disabled={!canAct}>
            {t(r.label)}
          </Button>
        ))}
        <InstructionBox
          trailing={<AiPill status={status} />}
          value={instruction}
          onInput={setInstruction}
          onSubmit={applyInstruction}
          placeholder={refining ? t('compare.refine') : t('custom.placeholder')}
          button={t('custom.apply')}
          disabled={running || (!refining && !draft.trim())}
        />
      </div>

      {sensitive.length > 0 && <SensitiveBar matches={sensitive} onSelect={showMatch} />}
      {error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {task?.kind === 'rewrite' ? (
        <Compare
          task={task}
          status={status}
          onChange={(text) => setTask({ ...task, text })}
          onUse={() => { replaceDraft(task.text); setTask(null); }}
          onRetry={() => rewrite(task.label, task.original, task.messages)}
          onDiscard={() => setTask(null)}
        />
      ) : (
        <div class={`grid items-start gap-4 ${task ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <section class="rounded-lg border border-line bg-surface shadow-sm">
            <div class="flex items-center gap-2 border-b border-line px-4 py-2">
              <h3 class="font-medium">{t('editor.title')}</h3>
              <span class="text-xs text-muted">{t('editor.words', { n: words })}</span>
              <div class="ml-auto flex gap-1">
                <Button variant="ghost" onClick={() => { setDraft(history.at(-1) ?? ''); setHistory((h) => h.slice(0, -1)); }} disabled={!history.length} title={t('editor.undoTitle')} icon={Undo2}>
                  {t('editor.undo')}
                </Button>
                <Button variant="ghost" onClick={() => { replaceDraft(''); setTask(null); }} disabled={!draft} icon={Eraser}>
                  {t('editor.clear')}
                </Button>
              </div>
            </div>
            <textarea
              ref={editor}
              class="block min-h-[420px] w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none"
              placeholder={t('editor.placeholder')}
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) review();
              }}
              spellcheck
            />
            <div class="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
              <Button onClick={copy} disabled={!draft.trim()} icon={copied ? Check : Copy}>
                {copied ? t('editor.copied') : t('editor.copy')}
              </Button>
              {!draft && (
                <button type="button" class="text-sm text-brand underline" onClick={() => { setDraft(EXAMPLES[lang]); editor.current?.focus(); }}>
                  {t('editor.example')}
                </button>
              )}
              {words > 1000 && <span class="text-xs text-warn">{t('editor.long')}</span>}
              <span class="ml-auto text-xs text-muted">{t('editor.notSaved')}</span>
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  // A new suggestion (retry or refine) always opens in "show changes" mode.
  useEffect(() => {
    if (!task.done) setEditing(false);
  }, [task.done]);
  const parts = useMemo(() => (task.done ? diffWords(task.original, task.text) : null), [task.done, task.original, task.text]);
  const changes = parts && countChanges(parts);

  return (
    <section class="rounded-lg border border-line bg-surface shadow-sm">
      <div class="grid md:grid-cols-2">
        <div class="border-b border-line md:border-b-0 md:border-r">
          <PaneHeader title={t('editor.title')} hint={parts ? t('compare.removed') : undefined} />
          <div class="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">
            {parts ? <DiffText parts={parts} side="before" /> : task.original}
          </div>
        </div>
        <div class="bg-brand-soft/30">
          <PaneHeader title={t('compare.suggestion', { label: task.label })} hint={parts && !editing ? t('compare.added') : undefined} />
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
            <Button onClick={onUse} icon={Check} title="Ctrl + Enter">{t('compare.use')}</Button>
            <Button variant="secondary" onClick={() => setEditing(!editing)} icon={Pencil}>{editing ? t('compare.showChanges') : t('compare.edit')}</Button>
            <Button variant="secondary" onClick={onRetry} icon={RotateCcw}>{t('compare.retry')}</Button>
            <Button variant="ghost" onClick={onDiscard} title="Esc">{t('compare.keepMine')}</Button>
            {changes && (
              <span class="ml-auto text-xs text-muted">
                <span class="text-brand">+{changes.added}</span> / <span class="text-bad">−{changes.removed}</span> {t('compare.words')}
              </span>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void ai.stop()} icon={Square}>{t('compare.stop')}</Button>
            <Button variant="ghost" onClick={() => { void ai.stop(); onDiscard(); }}>{t('compare.cancel')}</Button>
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
              <ins class="rounded bg-brand-soft px-0.5 text-brand no-underline">{words}</ins>
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
  const { t } = useI18n();
  const seconds = useElapsed(startedAt);
  if (status.state === 'loading') {
    return (
      <div class="space-y-2 text-sm">
        <p>{t('ai.startingLong', { pct: Math.round(status.fraction * 100) })}</p>
        <div class="h-1.5 overflow-hidden rounded-full bg-brand-soft">
          <div class="h-full bg-brand transition-all" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
        </div>
        <p class="text-xs text-muted">{t('ai.firstTimeOnly')}</p>
      </div>
    );
  }
  if (!text) {
    return (
      <div>
        <p class="mb-3 flex items-center gap-2 text-sm text-muted">
          <Spinner /> {t('compare.writing', { s: seconds })}
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
  const { t } = useI18n();
  const items = parseBullets(task.text);
  const seconds = useElapsed(task.startedAt);
  return (
    <section class="rounded-lg border border-line bg-surface shadow-sm">
      <div class="flex items-center gap-2 border-b border-line px-4 py-2">
        <h3 class="font-medium">{t('check.title')}</h3>
        <button type="button" class="ml-auto text-muted hover:text-ink" onClick={onClose} aria-label={t('check.close')}>
          <X size={18} />
        </button>
      </div>
      <div class="p-4">
        {status.state === 'loading' ? (
          <Streaming text="" startedAt={task.startedAt} status={status} />
        ) : items.length === 0 && !task.done ? (
          <>
            <p class="mb-3 flex items-center gap-2 text-sm text-muted">
              <Spinner /> {t('check.reading', { s: seconds })}
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
        {task.done && stale && <p class="mt-3 text-xs text-warn">{t('check.stale')}</p>}
        {!task.done && status.state !== 'loading' && (
          <div class="mt-3">
            <Button variant="ghost" onClick={() => void ai.stop()}>{t('compare.stop')}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function SensitiveBar({ matches, onSelect }: { matches: SensitiveMatch[]; onSelect: (m: SensitiveMatch) => void }) {
  const { lang, t } = useI18n();
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm">
      <span class="inline-flex items-center gap-1.5 font-medium text-warn">
        <ShieldAlert size={16} aria-hidden="true" /> {t('sensitive.title')}
      </span>
      <span class="text-xs text-muted">{t('sensitive.hint')}</span>
      {matches.map((m) => (
        <button
          type="button"
          class="rounded-full border border-amber-300 bg-surface px-2 py-0.5 text-xs hover:border-warn hover:bg-amber-100"
          title={t('sensitive.jump')}
          onClick={() => onSelect(m)}
        >
          {t(`kind.${m.kind}`)}
          {lang === 'fr' ? ' : ' : ': '}
          <code class="font-mono">{m.text}</code>
        </button>
      ))}
    </div>
  );
}

function AiPill({ status }: { status: AiStatus }) {
  const { t } = useI18n();
  const pill = 'flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs';
  switch (status.state) {
    case 'ready':
      return (
        <span class={pill}>
          <span class="h-2 w-2 rounded-full bg-good" /> {t('ai.ready')}
        </span>
      );
    case 'loading':
      return (
        <span class={pill}>
          <Spinner /> {t('ai.starting', { pct: Math.round(status.fraction * 100) })}
        </span>
      );
    case 'error':
      return (
        <button type="button" class={`${pill} border-red-200 bg-red-50 text-bad`} title={status.message} onClick={() => void ai.load().catch(() => {})}>
          {t('ai.retry')}
        </button>
      );
    default:
      return status.cached === false ? (
        <button type="button" class={`${pill} hover:bg-canvas`} onClick={() => void ai.load().catch(() => {})}>
          <Download size={13} aria-hidden="true" /> {t('ai.download', { mb: modeInfo(ai.mode).downloadMB })}
        </button>
      ) : (
        <span class={`${pill} text-muted`}>{t('ai.checking')}</span>
      );
  }
}

/** One-line instruction box ("make it warmer", "mets la demande en premier"…). Enter submits. */
function InstructionBox({
  value,
  onInput,
  onSubmit,
  placeholder,
  button,
  disabled,
  trailing,
}: {
  trailing?: ComponentChildren;
  value: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  button: string;
  disabled?: boolean;
}) {
  return (
    <form
      class="flex w-full basis-full flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        class="min-w-[14rem] flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
        placeholder={placeholder}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
      <button
        type="submit"
        class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || !value.trim()}
      >
        <Sparkles size={15} aria-hidden="true" /> {button}
      </button>
      {trailing && <div class="flex shrink-0 items-center">{trailing}</div>}
    </form>
  );
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function quote(instruction: string, lang: Lang) {
  const short = instruction.length > 40 ? instruction.slice(0, 40) + '…' : instruction;
  return lang === 'fr' ? `« ${short} »` : `“${short}”`;
}

function Spinner() {
  return <LoaderCircle size={15} class="animate-spin text-brand" aria-hidden="true" />;
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
