import { useEffect, useRef, useState } from 'preact/hooks';
import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Check, Sparkles, X } from 'lucide-preact';
import { useI18n, type Key } from '../i18n';
import { aiProofread, cachedAiIssues, checkParagraph, combine, quickIssues, warmSpelling } from '../check/checker';
import type { Issue } from '../check/types';
import type { TextLang } from './prompts';

/**
 * Proofreading in the editor, like a spell checker: issues are underlined, a click shows the fix.
 * Rules (no AI) run as you type; the AI's corrections are added on demand, each one verified first.
 */

const proofKey = new PluginKey<DecorationSet>('proofread');

/** TipTap extension holding the underlines. Positions follow edits until the next check replaces them. */
export const Proofread = Extension.create({
  name: 'proofread',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: proofKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => tr.getMeta(proofKey) ?? set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => proofKey.getState(state) },
      }),
    ];
  },
});

/** Each paragraph's plain text, with a way to turn a text offset back into a document position. */
function paragraphs(doc: PMNode) {
  const out: { text: string; at: (offset: number) => number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const segments: { offset: number; pos: number }[] = [];
    node.forEach((child, childOffset) => {
      segments.push({ offset: text.length, pos: pos + 1 + childOffset });
      // A line break or other inline node takes one position, like one character.
      text += child.isText ? child.text! : child.type.name === 'hardBreak' ? '\n' : '￼';
    });
    const at = (offset: number) => {
      let seg = { offset: 0, pos: pos + 1 };
      for (const s of segments) if (s.offset <= offset) seg = s;
      return seg.pos + (offset - seg.offset);
    };
    if (text.trim()) out.push({ text, at });
    return false;
  });
  return out;
}

export type Found = { id: string; issue: Issue; from: number; to: number };

const plainLetters = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Fixes "Fix all" may apply without asking: everything except a spelling guess, unless the dictionary
 * had a single suggestion or only accents/capitals differ ("pret" → "prêt"). "ok" → "oh" waits for a click.
 */
export function isSureFix(i: Issue): boolean {
  if (!i.suggestions.length) return false;
  if (i.kind !== 'spelling') return true;
  return i.suggestions.length === 1 || plainLetters(i.suggestions[0]) === plainLetters(i.text);
}

const ignoreKey = (i: Issue) => `${i.kind}\u0000${i.text}`;

export function useProofread(editor: Editor | null, lang: TextLang) {
  const [found, setFound] = useState<Found[]>([]);
  const [ai, setAi] = useState<{ done: number; total: number } | null>(null);
  const [active, setActive] = useState<{ entry: Found; rect: DOMRect } | null>(null);
  const ignored = useRef(new Set<string>());
  const langRef = useRef(lang);
  langRef.current = lang;
  const aiRun = useRef(0);

  /** Recomputes the underlines: instant checks and cached results first, then the spelling engine. */
  async function refresh() {
    if (!editor || editor.isDestroyed) return;
    const doc = editor.state.doc;
    const lang = langRef.current;
    const paras = paragraphs(doc);
    const show = (perPara: Issue[][]) => {
      if (editor.isDestroyed || editor.state.doc !== doc) return; // the text changed meanwhile: a newer check follows
      const entries: Found[] = [];
      perPara.forEach((issues, p) =>
        issues
          .filter((i) => !ignored.current.has(ignoreKey(i)))
          .forEach((issue) => entries.push({ id: `${p}:${issue.start}`, issue, from: paras[p].at(issue.start), to: paras[p].at(issue.end) })),
      );
      const decorations = entries.map((e) =>
        Decoration.inline(e.from, e.to, { class: `confi-issue confi-issue-${e.issue.kind}`, 'data-issue': e.id }),
      );
      editor.view.dispatch(editor.state.tr.setMeta(proofKey, DecorationSet.create(doc, decorations)).setMeta('addToHistory', false));
      setFound(entries);
    };
    // AI corrections (verified) come first: they are the most specific.
    const withAi = (p: { text: string }, rules: Issue[]) => combine(cachedAiIssues(p.text, lang), rules);
    show(paras.map((p) => withAi(p, quickIssues(p.text, lang))));
    const full = await Promise.all(paras.map((p) => checkParagraph(p.text, lang)));
    show(paras.map((p, i) => withAi(p, full[i])));
  }

  // Re-check shortly after typing stops.
  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    // Any change to the text, typed or set by Confi (example, undo, a suggestion used).
    const onChange = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      clearTimeout(timer);
      setActive(null);
      timer = window.setTimeout(() => void refresh(), 400);
    };
    editor.on('transaction', onChange);
    void refresh();
    return () => {
      clearTimeout(timer);
      editor.off('transaction', onChange);
    };
  }, [editor]);

  useEffect(() => {
    warmSpelling(lang);
    void refresh();
  }, [lang]);

  // Click on an underline: show its fix.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-issue]');
      const entry = el && found.find((f) => f.id === el.dataset.issue);
      setActive(entry ? { entry, rect: el!.getBoundingClientRect() } : null);
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor, found]);

  /** Replaces the underlined text, if it is still what was checked. */
  function apply(entries: Found[], pick: (f: Found) => string | undefined) {
    if (!editor) return;
    const tr = editor.state.tr;
    // From the end, so earlier positions stay valid.
    for (const f of [...entries].sort((a, b) => b.from - a.from)) {
      const fix = pick(f);
      if (fix === undefined || tr.doc.textBetween(f.from, f.to, '\n', '￼') !== f.issue.text) continue;
      if (fix) tr.insertText(fix, f.from, f.to);
      else tr.delete(f.from, f.to);
    }
    editor.view.dispatch(tr);
    editor.commands.focus();
    setActive(null);
  }

  return {
    found,
    active,
    ai,
    close: () => setActive(null),
    fix: (entry: Found, suggestion: string) => apply([entry], () => suggestion),
    fixAll: () => apply(found.filter((f) => isSureFix(f.issue)), (f) => f.issue.suggestions[0]),
    ignore(entry: Found) {
      ignored.current.add(ignoreKey(entry.issue));
      setActive(null);
      void refresh();
    },
    /** Asks the AI to proofread each paragraph in turn; corrections appear as they're verified. */
    async runAi() {
      if (!editor) return;
      const run = ++aiRun.current;
      const texts = paragraphs(editor.state.doc).map((p) => p.text);
      setAi({ done: 0, total: texts.length });
      try {
        for (const [i, text] of texts.entries()) {
          if (run !== aiRun.current) return;
          await aiProofread(text, langRef.current);
          setAi({ done: i + 1, total: texts.length });
          void refresh();
        }
      } finally {
        if (run === aiRun.current) setAi(null);
      }
    },
    stopAi() {
      aiRun.current++;
      setAi(null);
    },
  };
}

const KIND_LABEL: Record<Issue['kind'], Key> = { spelling: 'proof.spelling', grammar: 'proof.grammar', shorthand: 'proof.shorthand' };

/** The small card under a clicked underline: the fix(es), or ignore. */
export function IssuePopover({
  entry,
  rect,
  onFix,
  onIgnore,
  onClose,
}: {
  entry: Found;
  rect: DOMRect;
  onFix: (suggestion: string) => void;
  onIgnore: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const card = useRef<HTMLDivElement>(null);
  const { issue } = entry;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!card.current?.contains(target) && !target.closest('[data-issue]')) onClose();
    };
    addEventListener('keydown', onKey);
    addEventListener('mousedown', onDown);
    addEventListener('scroll', onClose, true);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('mousedown', onDown);
      removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(rect.left, innerWidth - 288));
  return (
    <div
      ref={card}
      role="dialog"
      aria-label={t(KIND_LABEL[issue.kind])}
      class="fixed z-50 w-72 rounded-xl border border-line bg-surface p-3 shadow-card"
      style={{ top: `${rect.bottom + 6}px`, left: `${left}px` }}
    >
      <div class="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span class={`h-2 w-2 rounded-full confi-dot-${issue.kind}`} aria-hidden="true" />
        {t(KIND_LABEL[issue.kind])}
        {issue.source === 'ai' && (
          <span class="ml-auto inline-flex items-center gap-1 text-brand">
            <Sparkles size={12} aria-hidden="true" /> {t('proof.byAi')}
          </span>
        )}
      </div>
      {issue.message && (
        <p class="mt-1.5 text-sm text-ink/80" lang="fr">
          {issue.message}
        </p>
      )}
      {issue.suggestions.length ? (
        <div class="mt-2 flex flex-wrap gap-1.5">
          {issue.suggestions.map((s, i) => (
            <button
              type="button"
              // The best fix stands out; alternatives stay quiet.
              class={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium ${
                i === 0 ? 'bg-brand text-white hover:brightness-110' : 'border border-line text-ink hover:border-brand/40 hover:bg-canvas'
              }`}
              onClick={() => onFix(s)}
            >
              {i === 0 && <Check size={14} aria-hidden="true" />} {s || t('proof.remove')}
            </button>
          ))}
        </div>
      ) : (
        <p class="mt-2 text-sm text-ink/80">{t('proof.noSuggestion')}</p>
      )}
      <button type="button" class="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={onIgnore}>
        <X size={12} aria-hidden="true" /> {t('proof.ignore')}
      </button>
    </div>
  );
}
