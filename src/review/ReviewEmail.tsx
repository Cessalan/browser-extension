import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { GpuLostError, ai, useAiStatus, type AiStatus } from '../ai/engine';
import { Button } from '../ui';
import { useI18n, type Key, type Lang } from '../i18n';
import {
  Briefcase, Check, ClipboardCheck, Copy, Download, Eraser, Lightbulb, LoaderCircle,
  Info, Languages, Scissors, Sparkles, TriangleAlert, SpellCheck, Square, Undo2, X, type LucideIcon,
} from 'lucide-preact';
import { findSensitive, type SensitiveMatch } from './sensitive';
import { REWRITES, detectTextLang, parseBullets, reviewMessages, type RewriteId } from './prompts';
import { IssuePopover, isSureFix, useProofread } from './proofread';
import { UnreliableError, rewriteText, type RewriteJob } from './rewrite';
import { translateText } from '../ai/translate';

const REWRITE_ICONS: Record<RewriteId, LucideIcon> = { clearer: Lightbulb, professional: Briefcase, shorter: Scissors, fix: SpellCheck };
import { countChanges, diffWords, type DiffPart } from './diff';
import { modeInfo, type AiMode } from '../speedtest/models';
import type { Editor } from '@tiptap/core';
import { FormatBar, RichEditor, selectText } from './RichEditor';
import { markdownToHtml, markdownToPlain } from './format';

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
/** `translated`: the suggestion is in the other language, so it's shown side by side without highlighting changes. */
type Rewrite = { kind: 'rewrite'; label: string; original: string; text: string; done: boolean; startedAt: number; translated?: boolean };
type Task = Review | Rewrite;
/** Runs one AI request, streaming the text so far; returns the final text. */
type Exec = (onText: (text: string) => void) => Promise<string>;

export function ReviewEmail() {
  // The draft as Markdown (what the AI reads); the editor shows it as rich text.
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<{ text: string; gpuLost?: boolean; unreliable?: boolean } | null>(null);
  // Set when Confi switched to a lighter AI mode on its own after a graphics reset.
  const [switchedTo, setSwitchedTo] = useState<AiMode | null>(null);
  useEffect(() => ai.onFallback(setSwitchedTo), []);
  // The last AI request, so "Try again" can repeat it.
  const lastRun = useRef<{ next: Task; exec: Exec } | null>(null);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState('');
  const status = useAiStatus();
  const { lang, t } = useI18n();
  const [editor, setEditor] = useState<Editor | null>(null);

  const plain = useMemo(() => markdownToPlain(draft), [draft]);
  const sensitive = useMemo(() => findSensitive(plain), [plain]);
  const running = task !== null && !task.done;
  // Underlines in the editor: spelling, grammar and shorthand, in the text's own language.
  const textLang = plain.trim() ? detectTextLang(plain) : lang;
  const proof = useProofread(editor, textLang);
  const words = countWords(plain);

  // Drafts are never saved, so warn before the tab closes with one in progress.
  useEffect(() => {
    if (!plain.trim()) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [plain.trim().length > 0]);

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

  /** Selects a flagged detail in the editor so the user can see or delete it. */
  const pendingSelection = useRef<SensitiveMatch | null>(null);
  function showMatch(m: SensitiveMatch) {
    pendingSelection.current = m;
    if (task?.kind === 'rewrite') setTask(null); // the editor is hidden behind the compare view
    else applySelection();
  }
  function applySelection() {
    const m = pendingSelection.current;
    if (!m || !editor) return;
    pendingSelection.current = null;
    selectText(editor, m.text);
  }
  useEffect(applySelection); // runs once the editor is back on screen

  // Warm up the model in the background if it's already downloaded.
  useEffect(() => {
    if (status.state === 'idle' && status.cached) void ai.load().catch(() => {});
  }, [status]);

  /** Shows `md` in the editor (if it's on screen; otherwise it loads `draft` when it comes back). */
  function setEditorContent(md: string) {
    editor?.commands.setContent(md ? markdownToHtml(md) : '', { emitUpdate: false });
    setDraft(md);
  }

  function replaceDraft(next: string) {
    setHistory((h) => [...h.slice(-19), draft]);
    setEditorContent(next);
  }

  async function run(next: Task, exec: Exec) {
    setError(null);
    lastRun.current = { next, exec };
    setTask(next);
    try {
      const text = await exec((t) => setTask((cur) => cur && { ...cur, text: t }));
      setTask((cur) => cur && { ...cur, text, done: true });
    } catch (err) {
      setTask(null);
      if (err instanceof GpuLostError) setError({ text: '', gpuLost: true });
      // The model ignored the text or dropped a protected detail (it happens with the smallest modes).
      else if (err instanceof UnreliableError) setError({ text: '', unreliable: true });
      else setError({ text: err instanceof Error ? err.message : String(err) });
    }
  }

  function retry() {
    const last = lastRun.current;
    setError(null);
    if (last) void run({ ...last.next, text: '', done: false, startedAt: Date.now() }, last.exec);
  }

  function review() {
    if (!plain.trim() || running) return;
    void run({ kind: 'review', text: '', done: false, forDraft: draft, startedAt: Date.now() }, (onText) =>
      ai.generate(reviewMessages(plain, lang), onText, 300),
    );
  }

  /** `original` is what the diff compares against; `input` is what gets rewritten (a previous suggestion when refining). */
  function rewrite(label: string, original: string, job: RewriteJob, input = original, translated = false) {
    void run({ kind: 'rewrite', label, original, text: '', done: false, startedAt: Date.now(), translated }, (onText) =>
      rewriteText(job, input, onText).then((r) => r.text),
    );
  }

  /** Translates the draft into the other language (French ↔ English). */
  function translate() {
    const to = textLang === 'fr' ? 'en' : 'fr';
    const label = t(to === 'en' ? 'translate.inEn' : 'translate.inFr');
    void run({ kind: 'rewrite', label, original: draft, text: '', done: false, startedAt: Date.now(), translated: true }, (onText) =>
      translateText(draft, textLang, to, onText),
    );
  }

  // With a suggestion on screen, the instruction box refines that suggestion; otherwise it edits the draft.
  const refining = task?.kind === 'rewrite' && task.done;

  function applyInstruction() {
    const text = instruction.trim();
    if (!text || running) return;
    if (task?.kind === 'rewrite' && task.done) {
      // Keep diffing against the user's original email.
      rewrite(quote(text, lang), task.original, { instruction: text }, task.text, task.translated);
    } else if (plain.trim()) {
      rewrite(quote(text, lang), draft, { instruction: text });
    } else {
      return;
    }
    setInstruction('');
  }

  /** Copies rich text (keeps bold, lists… when pasted into Outlook or Gmail) with a plain-text fallback. */
  async function copy() {
    const html = editor?.getHTML() ?? markdownToHtml(draft);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canAct = plain.trim().length > 0 && !running;

  return (
    <div class="space-y-4">
      {/* Toolbar */}
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5 shadow-card">
        <Button onClick={review} disabled={!canAct} title="Ctrl + Enter" icon={ClipboardCheck}>
          {t('review.check')}
        </Button>
        <span class="mx-1 hidden h-6 w-px bg-line sm:block" />
        <span class="px-1 text-xs font-medium uppercase tracking-wide text-muted">{t('review.rewrite')}</span>
        {REWRITES.map((r) => (
          <Button
            key={r.id}
            variant="secondary"
            icon={REWRITE_ICONS[r.id]}
            // Spelling & grammar: the AI suggests corrections in the editor (verified, one click each) instead of rewriting.
            onClick={() => (r.id === 'fix' ? void proof.runAi() : rewrite(t(r.label), draft, { id: r.id }))}
            disabled={!canAct || (r.id === 'fix' && proof.ai !== null) || (r.id === 'fix' && task?.kind === 'rewrite')}
          >
            {t(r.label)}
          </Button>
        ))}
        <Button variant="secondary" icon={Languages} onClick={translate} disabled={!canAct}>
          {t(textLang === 'fr' ? 'translate.toEn' : 'translate.toFr')}
        </Button>
        <InstructionBox
          trailing={needsAttention(status) ? <AiPill status={status} /> : undefined}
          value={instruction}
          onInput={setInstruction}
          onSubmit={applyInstruction}
          placeholder={refining ? t('compare.refine') : t('custom.placeholder')}
          button={t('custom.apply')}
          disabled={running || (!refining && !plain.trim())}
        />
      </div>

      {sensitive.length > 0 && <SensitiveBar matches={sensitive} onSelect={showMatch} />}
      {switchedTo && (
        <div class="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft/50 px-4 py-2.5 text-sm" role="status">
          <Info size={16} class="shrink-0 text-brand" aria-hidden="true" />
          <span class="flex-1">{t('ai.switched', { mode: t(`mode.${switchedTo}` as Key) })}</span>
          <button type="button" class="rounded-md p-1 text-muted hover:bg-white hover:text-ink" onClick={() => setSwitchedTo(null)} aria-label={t('check.close')}>
            <X size={16} />
          </button>
        </div>
      )}
      {error?.gpuLost ? (
        <GpuLostNotice
          onCompat={() => {
            setError(null);
            void ai.setMode('compat');
          }}
          onRetry={retry}
        />
      ) : error?.unreliable ? (
        <section class="flex gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" role="status">
          <Info size={20} class="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="text-ink">{t('ai.unreliable')}</p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={retry}
              >
                {t('ai.gpuLost.retry')}
              </Button>
              <a href="#/setup" class="text-sm text-brand underline">{t('ai.unreliableSetup')}</a>
            </div>
          </div>
        </section>
      ) : (
        error && <p class="rounded-md bg-red-50 p-3 text-sm text-bad">{error.text}</p>
      )}

      {task?.kind === 'rewrite' ? (
        <Compare
          task={task}
          status={status}
          onChange={(text) => setTask({ ...task, text })}
          onUse={() => { replaceDraft(task.text); setTask(null); }}
          onDiscard={() => setTask(null)}
        />
      ) : (
        <div class={`grid items-start gap-4 ${task ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <section class="rounded-xl border border-line bg-surface shadow-card">
            <div class="flex items-center gap-2 border-b border-line px-4 py-2">
              <h3 class="whitespace-nowrap font-medium">{t('editor.title')}</h3>
              <span class="whitespace-nowrap text-xs text-muted">{t('editor.words', { n: words })}</span>
              {plain.trim() && <ProofSummary proof={proof} />}
              <div class="ml-auto flex gap-1">
                <Button variant="ghost" onClick={() => { setEditorContent(history.at(-1) ?? ''); setHistory((h) => h.slice(0, -1)); }} disabled={!history.length} title={t('editor.undoTitle')} icon={Undo2}>
                  {t('editor.undo')}
                </Button>
                <Button variant="ghost" onClick={() => { replaceDraft(''); setTask(null); }} disabled={!draft} icon={Eraser}>
                  {t('editor.clear')}
                </Button>
              </div>
            </div>
            <div class="border-b border-line px-2.5 py-1.5">
              <FormatBar editor={editor} />
            </div>
            <RichEditor
              initialMarkdown={draft}
              placeholder={t('editor.placeholder')}
              onChange={setDraft}
              onReady={setEditor}
              onSubmit={review}
              class="min-h-[400px] p-4 text-[15px] leading-relaxed"
            />
            <div class="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
              <Button onClick={copy} disabled={!plain.trim()} icon={copied ? Check : Copy}>
                {copied ? t('editor.copied') : t('editor.copy')}
              </Button>
              {!plain.trim() && (
                <button type="button" class="text-sm text-brand underline" onClick={() => { setEditorContent(EXAMPLES[lang]); editor?.commands.focus('end'); }}>
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

/** "3 suggestions · Fix all", and the AI's progress while it proofreads. */
function ProofSummary({ proof }: { proof: ReturnType<typeof useProofread> }) {
  const { t } = useI18n();
  const n = proof.found.length;
  const fixable = proof.found.some((f) => isSureFix(f.issue));
  return (
    <span class="flex min-w-0 items-center gap-2 text-xs">
      <span class="h-3 w-px bg-line" aria-hidden="true" />
      {proof.ai ? (
        <>
          <LoaderCircle size={13} class="animate-spin text-brand" aria-hidden="true" />
          <span class="whitespace-nowrap text-muted">{t('proof.aiRunning', { done: proof.ai.done, total: proof.ai.total })}</span>
          <button type="button" class="text-muted underline hover:text-ink" onClick={proof.stopAi}>{t('proof.stop')}</button>
        </>
      ) : n === 0 ? (
        <span class="inline-flex items-center gap-1 whitespace-nowrap text-good">
          <Check size={13} aria-hidden="true" /> {t('proof.none')}
        </span>
      ) : (
        <>
          <span class="whitespace-nowrap font-medium text-ink">{n === 1 ? t('proof.count1') : t('proof.count', { n })}</span>
          {fixable && (
            <button type="button" class="whitespace-nowrap font-medium text-brand hover:underline" onClick={proof.fixAll}>
              {t('proof.fixAll')}
            </button>
          )}
        </>
      )}
      {proof.active && (
        <IssuePopover
          entry={proof.active.entry}
          rect={proof.active.rect}
          onFix={(s) => proof.fix(proof.active!.entry, s)}
          onIgnore={() => proof.ignore(proof.active!.entry)}
          onClose={proof.close}
        />
      )}
    </span>
  );
}

function Compare({
  task,
  status,
  onChange,
  onUse,
  onDiscard,
}: {
  task: Rewrite;
  status: AiStatus;
  onChange: (text: string) => void;
  onUse: () => void;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  // A new suggestion (rewrite or refine) always opens in "show changes" mode.
  useEffect(() => {
    if (!task.done) setEditing(false);
  }, [task.done]);
  const parts = useMemo(
    () => (task.done && !task.translated ? diffWords(markdownToPlain(task.original), markdownToPlain(task.text)) : null),
    [task.done, task.original, task.text],
  );
  const changes = parts && countChanges(parts);

  return (
    <section class="rounded-xl border border-line bg-surface shadow-card">
      <div class="grid md:grid-cols-2">
        <div class="border-b border-line md:border-b-0 md:border-r">
          <PaneHeader title={t('editor.title')} hint={parts ? t('compare.removed') : undefined} />
          <div class="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">
            {parts ? <DiffText parts={parts} side="before" /> : markdownToPlain(task.original)}
          </div>
        </div>
        <div class="bg-brand-soft/30">
          <PaneHeader
            title={t('compare.suggestion', { label: task.label })}
            hint={parts && !editing ? t('compare.added') : undefined}
            action={
              <button type="button" class="rounded-md p-1 text-muted hover:bg-white hover:text-ink" onClick={onDiscard} title={`${t('compare.keepMine')} (Esc)`} aria-label={t('compare.keepMine')}>
                <X size={16} />
              </button>
            }
          />
          {editing ? (
            <div class="bg-surface ring-2 ring-inset ring-brand/40">
              <RichEditor initialMarkdown={task.text} onChange={onChange} autofocus class="min-h-[300px] p-4 text-[15px] leading-relaxed" />
            </div>
          ) : (
            <div
              class={`min-h-[300px] whitespace-pre-wrap p-4 text-[15px] leading-relaxed ${task.done ? 'cursor-text rounded-b-xl hover:bg-white/60' : ''}`}
              onClick={() => task.done && setEditing(true)}
              title={task.done ? t('compare.clickToEdit') : undefined}
            >
              {parts ? (
                <DiffText parts={parts} side="after" />
              ) : task.done ? (
                markdownToPlain(task.text)
              ) : (
                <Streaming text={markdownToPlain(task.text)} startedAt={task.startedAt} status={status} />
              )}
            </div>
          )}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {task.done ? (
          <>
            <Button key="use" onClick={onUse} icon={Check} title="Ctrl + Enter">{t('compare.use')}</Button>
            <span class="text-xs text-muted">{editing && parts ? (
              <button type="button" class="underline hover:text-ink" onClick={() => setEditing(false)}>{t('compare.showChanges')}</button>
            ) : t('compare.clickToEdit')}</span>
            {changes && (
              <span class="ml-auto text-xs text-muted">
                <span class="text-brand">+{changes.added}</span> / <span class="text-bad">−{changes.removed}</span> {t('compare.words')}
              </span>
            )}
          </>
        ) : (
          <>
            <Button key="stop" variant="secondary" onClick={() => void ai.stop()} icon={Square}>{t('compare.stop')}</Button>
            <Button key="cancel" variant="ghost" onClick={() => { void ai.stop(); onDiscard(); }}>{t('compare.cancel')}</Button>
          </>
        )}
      </div>
    </section>
  );
}

function PaneHeader({ title, hint, action }: { title: string; hint?: string; action?: ComponentChildren }) {
  return (
    <div class="flex h-11 items-center gap-2 border-b border-line px-4">
      <h3 class="font-medium">{title}</h3>
      {hint && <span class="ml-auto text-xs text-muted">{hint}</span>}
      {action && <span class={hint ? '' : 'ml-auto'}>{action}</span>}
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
    <section class="rounded-xl border border-line bg-surface shadow-card">
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
    <div class="rounded-xl border border-brand/20 bg-surface px-4 py-3 text-sm shadow-card">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="inline-flex items-center gap-2 font-medium text-ink">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" class="h-7 w-7" />
          {t(matches.length === 1 ? 'sensitive.protectedOne' : 'sensitive.protectedMany', { n: matches.length })}
        </span>
        <span class="text-xs text-muted" title={t('sensitive.why')}>{t('sensitive.hint')}</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-2 pl-9">
      {matches.map((m) => (
        <button
          type="button"
          class="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs text-ink hover:border-brand/40 hover:bg-brand-soft/50"
          title={t('sensitive.jump')}
          onClick={() => onSelect(m)}
        >
          {t(`kind.${m.kind}`)}
          {lang === 'fr' ? ' : ' : ': '}
          <code class="font-mono">{m.text}</code>
        </button>
      ))}
      </div>
    </div>
  );
}

/** The AI status is only shown when the user might need to know or act: download, loading, or error. */
function needsAttention(status: AiStatus) {
  return status.state === 'loading' || status.state === 'error' || (status.state === 'idle' && status.cached === false);
}

function AiPill({ status }: { status: AiStatus }) {
  const { t } = useI18n();
  const pill = 'flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs';
  switch (status.state) {
    case 'ready':
      return null;
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
          <Download size={13} aria-hidden="true" />{' '}
          {modeInfo(ai.mode).builtin ? t('ai.downloadChrome') : t('ai.download', { mb: modeInfo(ai.mode).downloadMB })}
        </button>
      ) : null;
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

/** Shown when the graphics chip was reset mid-task: explains it calmly and offers a steadier mode. */
function GpuLostNotice({ onCompat, onRetry }: { onCompat: () => void; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <section class="flex gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <TriangleAlert size={20} class="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-ink">{t('ai.gpuLost.title')}</p>
        <p class="mt-1 text-ink/80">{t('ai.gpuLost.text')}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button onClick={onCompat}>{t('ai.gpuLost.compat', { mb: modeInfo('compat').downloadMB })}</Button>
          <Button variant="secondary" onClick={onRetry}>{t('ai.gpuLost.retry')}</Button>
        </div>
      </div>
    </section>
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
