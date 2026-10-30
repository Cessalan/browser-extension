import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { GpuLostError, ai, useAiStatus, type AiStatus } from '../ai/engine';
import { Button, ShimmerText, Skeleton } from '../ui';
import { useI18n, type Key, type Lang } from '../i18n';
import {
  Briefcase, Check, ClipboardCheck, Copy, Download, Eraser, Lightbulb,
  Info, Languages, Scissors, Sparkles, TriangleAlert, SpellCheck, Square, Undo2, X, type LucideIcon,
} from 'lucide-preact';
import { findSensitive, type SensitiveMatch } from './sensitive';
import { REWRITES, detectTextLang, parseBullets, reviewMessages, type RewriteId } from './prompts';
import { IssuePopover, isSureFix, useProofread } from './proofread';
import { UnreliableError, rewriteText, type RewriteJob } from './rewrite';
import { translateText } from '../ai/translate';
import { Assistant, type ChatEntry } from './Assistant';
import { VersionsMenu, type Version } from './Versions';
import { CHAT_SCHEMA, chatMessages, splitReply, unlockProposal, type ChatTurn } from './chat';
import { unlockDetails } from '../ai/mask';

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
        replaceDraft(task.text, task.label);
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

  // Every version of the text made in this session, so the person can go back to any of them. Memory only.
  const [versions, setVersions] = useState<Version[]>([]);
  const versionId = useRef(0);
  /** Title for the version the next change of `draft` produces (the editor reports new text asynchronously). */
  const pendingVersion = useRef<string | null>(null);

  /** Adds a version, unless the text is empty or unchanged. Without a title: "Original text", then "Your edits". */
  function addVersion(text: string, title?: string) {
    if (!text.trim()) return;
    setVersions((v) =>
      v.at(-1)?.text === text
        ? v
        : [...v.slice(-49), { id: ++versionId.current, title: title ?? t(v.length ? 'versions.yourEdits' : 'versions.original'), at: Date.now(), text }],
    );
  }
  useEffect(() => {
    if (pendingVersion.current === null) return;
    addVersion(draft, pendingVersion.current);
    pendingVersion.current = null;
  }, [draft]);

  /** Replaces the text, keeping what was there (typed edits included) as a version first. */
  function replaceDraft(next: string, title?: string) {
    addVersion(draft);
    setHistory((h) => [...h.slice(-19), draft]);
    if (title) pendingVersion.current = title;
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

  // Assistant chat, with Chrome's built-in AI (smart enough to hold a conversation). Never saved.
  const chatOn = ai.mode === 'chrome';
  // The mode is picked from this computer's specs after the first render: show the chat once it's known.
  const [, modeKnown] = useState(false);
  useEffect(() => void ai.resolveMode().then(() => modeKnown(true)), []);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState<{ say: string; writing: boolean } | null>(null);
  const chatHistory = useRef<ChatTurn[]>([]);
  const chatRun = useRef(0);

  /** Sends a request to the assistant. A proposed version opens side by side; the text itself never changes on its own. */
  async function sendChat(request: string) {
    const run = ++chatRun.current;
    // With a suggestion on screen, the request applies to that suggestion (diffed against the original text).
    const current = task?.kind === 'rewrite' && task.done ? task : null;
    const base = current?.text ?? draft;
    const original = current?.original ?? draft;
    const startedAt = Date.now();
    setError(null);
    setChatLog((l) => [...l, { role: 'user', say: request }]);
    setChatBusy({ say: '', writing: false });
    const { messages, locked } = chatMessages(chatHistory.current, request, base, detectTextLang(markdownToPlain(base)) );
    const proposal = (text: string, done: boolean): Task => ({
      kind: 'rewrite', label: quote(request, lang), original, text, done, startedAt, translated: current?.translated,
    });
    try {
      const words = countWords(markdownToPlain(base));
      const raw = await ai.generate(
        messages,
        (soFar) => {
          if (run !== chatRun.current) return;
          const r = splitReply(soFar, words);
          setChatBusy({ say: r.say, writing: r.writing });
          if (r.text) setTask(proposal(unlockDetails(r.text, locked).text, false));
        },
        Math.min(2000, words * 3 + 200),
        CHAT_SCHEMA,
      );
      if (run !== chatRun.current) return;
      const r = splitReply(raw, words);
      const text = r.text && unlockProposal(r.text, locked);
      if (text) setTask(proposal(text, true));
      else if (r.text) setTask(current); // the AI dropped a protected detail: keep what was there
      chatHistory.current = [...chatHistory.current, { role: 'user' as const, content: request }, { role: 'assistant' as const, content: r.say || '…' }].slice(-12);
      setChatLog((l) => [...l, { role: 'assistant', say: r.say, proposal: text ? 'shown' : r.text ? 'setAside' : undefined }]);
    } catch {
      if (run === chatRun.current) setChatLog((l) => [...l, { role: 'assistant', say: '', failed: true }]);
    } finally {
      if (run === chatRun.current) setChatBusy(null);
    }
  }

  function resetChat() {
    chatRun.current++;
    chatHistory.current = [];
    setChatLog([]);
    setChatBusy(null);
  }

  /** Closes the suggestion (and stops the assistant if it was still writing it). */
  function discard() {
    if (chatBusy) {
      chatRun.current++;
      setChatBusy(null);
      void ai.stop();
    }
    setTask(null);
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

  /** Copies the text, ready to paste into an email. */
  async function copy() {
    await copyRich(editor?.getHTML() ?? markdownToHtml(draft), plain);
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
        {/* With the assistant chat on, instructions go through the chat instead. */}
        {chatOn ? (
          needsAttention(status) && <span class="ml-auto"><AiPill status={status} /></span>
        ) : (
          <InstructionBox
            trailing={needsAttention(status) ? <AiPill status={status} /> : undefined}
            value={instruction}
            onInput={setInstruction}
            onSubmit={applyInstruction}
            placeholder={refining ? t('compare.refine') : t('custom.placeholder')}
            button={t('custom.apply')}
            disabled={running || (!refining && !plain.trim())}
          />
        )}
      </div>

      <div class={chatOn ? 'grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]' : ''}>
      {chatOn && (
        <Assistant
          entries={chatLog}
          busy={chatBusy}
          disabled={!plain.trim() || running}
          onSend={(m) => void sendChat(m)}
          onReset={resetChat}
        />
      )}
      <div class="min-w-0 space-y-4">
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
          onUse={() => { replaceDraft(task.text, task.label); setTask(null); }}
          onDiscard={discard}
        />
      ) : (
        <div class={`grid items-start gap-4 ${task && !chatOn ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <section class="rounded-xl border border-line bg-surface shadow-card">
            <div class="flex items-center gap-2 border-b border-line px-4 py-2">
              <h3 class="whitespace-nowrap font-medium">{t('editor.title')}</h3>
              <span class="whitespace-nowrap text-xs text-muted">{t('editor.words', { n: words })}</span>
              {plain.trim() && (
                <ProofSummary
                  proof={proof}
                  onFixAll={() => {
                    addVersion(draft);
                    pendingVersion.current = t('versions.fixAll');
                    proof.fixAll();
                  }}
                />
              )}
              <div class="ml-auto flex items-center gap-1">
                <VersionsMenu versions={versions} current={draft} editsTitle={t('versions.yourEdits')} onRestore={(v) => replaceDraft(v.text, t('versions.restored', { title: v.title }))} />
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
      </div>
    </div>
  );
}

/** "3 suggestions · Fix all", and the AI's progress while it proofreads. */
function ProofSummary({ proof, onFixAll }: { proof: ReturnType<typeof useProofread>; onFixAll: () => void }) {
  const { t } = useI18n();
  const n = proof.found.length;
  const fixable = proof.found.some((f) => isSureFix(f.issue));
  return (
    <span class="flex min-w-0 items-center gap-2 text-xs">
      <span class="h-3 w-px bg-line" aria-hidden="true" />
      {proof.ai ? (
        <>
          <ShimmerText class="whitespace-nowrap">{t('proof.aiRunning', { done: proof.ai.done, total: proof.ai.total })}</ShimmerText>
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
            <button type="button" class="whitespace-nowrap font-medium text-brand hover:underline" onClick={onFixAll}>
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

/** Copies rich text (keeps bold, lists… when pasted into Outlook or Gmail) with a plain-text fallback. */
async function copyRich(html: string, plain: string) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
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
  const [copied, setCopied] = useState(false);
  // Copy the new version straight away, ready to paste, without replacing the text first.
  async function copyVersion() {
    await copyRich(markdownToHtml(task.text), markdownToPlain(task.text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
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
          <PaneHeader title={t('editor.title')} />
          <div class="whitespace-pre-wrap p-4 text-[15px] leading-relaxed">
            {parts ? <DiffText parts={parts} side="before" /> : markdownToPlain(task.original)}
          </div>
        </div>
        <div class="bg-brand-soft/30">
          <PaneHeader
            title={t('compare.newVersion')}
            action={
              task.done && (
                // Where people look to copy: the corner of the text itself.
                <button
                  type="button"
                  class={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    copied ? 'border-green-200 bg-green-50 text-good' : 'border-line bg-surface text-ink shadow-sm hover:border-brand/40 hover:text-brand'
                  }`}
                  onClick={() => void copyVersion()}
                >
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied ? t('editor.copied') : t('compare.copy')}
                </button>
              )
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
            {/* "Click to edit" is the new version's tooltip; the footer stays on one line. */}
            {editing && parts && (
              <button type="button" class="text-xs text-muted underline hover:text-ink" onClick={() => setEditing(false)}>{t('compare.showChanges')}</button>
            )}
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
          <div class="progress-shine h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
        </div>
        <p class="text-xs text-muted">{t('ai.firstTimeOnly')}</p>
      </div>
    );
  }
  if (!text) {
    return (
      <div>
        <p class="mb-4 text-sm">
          <ShimmerText>{seconds < 5 ? t('compare.writingNow') : t('compare.writing', { s: seconds })}</ShimmerText>
        </p>
        <Skeleton />
      </div>
    );
  }
  return (
    <>
      {text}
      <span class="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-full bg-brand align-middle" />
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
            <p class="mb-4 text-sm">
              <ShimmerText>{seconds < 5 ? t('check.readingNow') : t('check.reading', { s: seconds })}</ShimmerText>
            </p>
            <Skeleton shape="lines" lines={3} />
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
          <ShimmerText>{t('ai.starting', { pct: Math.round(status.fraction * 100) })}</ShimmerText>
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

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}
