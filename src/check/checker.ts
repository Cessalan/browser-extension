import { ai } from '../ai/engine';
import type { TextLang } from '../review/prompts';
import { detailValue, findSensitive } from '../review/sensitive';
import { parseEdits, proofreadMessages, verifyEdits } from './aiEdits';
import { findBasics } from './rules';
import { findShorthand } from './shorthand';
import type { SpellRequest, SpellResponse } from './spell.worker';
import { mergeIssues, type Issue } from './types';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: SpellResponse) => void>();

function ask(req: Omit<SpellRequest, 'id'>): Promise<Issue[]> {
  if (!worker) {
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SpellResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => ('error' in r ? reject(new Error(r.error)) : resolve(r.issues)));
    worker!.postMessage({ ...req, id } as SpellRequest);
  });
}

// French grammar: Grammalecte (public/grammalecte-*, GPL v3), a classic worker because its files are plain scripts.
const GRAMMALECTE = `${import.meta.env.BASE_URL}grammalecte-2.3.0/worker.js`;
let grammarWorker: Worker | null = null;
const grammarPending = new Map<number, (r: { errors?: { start: number; end: number; suggestions: string[]; message: string }[]; error?: string }) => void>();

function frenchGrammar(text: string): Promise<Issue[]> {
  if (!grammarWorker) {
    grammarWorker = new Worker(GRAMMALECTE);
    grammarWorker.onmessage = (e) => {
      grammarPending.get(e.data.id)?.(e.data);
      grammarPending.delete(e.data.id);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    grammarPending.set(id, (r) =>
      r.error || !r.errors
        ? reject(new Error(r.error))
        : resolve(
            r.errors.map((x) => ({ start: x.start, end: x.end, text: text.slice(x.start, x.end), suggestions: x.suggestions.slice(0, 3), kind: 'grammar', message: x.message, source: 'rules' })),
          ),
    );
    grammarWorker!.postMessage({ id, text });
  });
}

/** Starts loading the spelling engine for a language in the background. */
export function warmSpelling(lang: TextLang) {
  void ask({ warm: lang }).catch(() => {});
  if (lang === 'fr') void frenchGrammar('').catch(() => {});
}

const cache = new Map<string, Promise<Issue[]>>();

/**
 * All non-AI issues in one paragraph: our shorthand list and basic rules (instant), then the spelling
 * and grammar engines (in workers; French grammar by Grammalecte). Cached by paragraph text, so only edited paragraphs are re-checked.
 */
export function checkParagraph(text: string, lang: TextLang): Promise<Issue[]> {
  const key = `${lang}\u0000${text}`;
  let result = cache.get(key);
  if (!result) {
    const quick = [findShorthand(text, lang), findBasics(text, lang)];
    // Engines unavailable: still show the quick checks.
    const spelling = ask({ lang, text }).catch(() => [] as Issue[]);
    const grammar = lang === 'fr' ? frenchGrammar(text).catch(() => [] as Issue[]) : Promise.resolve([]);
    result = Promise.all([spelling, grammar]).then(([spell, gramm]) => mergeIssues([...quick, spell, gramm], protectedRanges(text)));
    if (cache.size > 500) cache.clear();
    cache.set(key, result);
  }
  return result;
}

/** Issues found without waiting for the engine (shown right away). */
export function quickIssues(text: string, lang: TextLang): Issue[] {
  return mergeIssues([findShorthand(text, lang), findBasics(text, lang)], protectedRanges(text));
}

const aiCache = new Map<string, Issue[]>();
/** Every correction the AI proposed and Confi verified, so they survive other edits to the paragraph. */
const aiEdits: Record<TextLang, { wrong: string; right: string }[]> = { fr: [], en: [] };

/**
 * AI corrections for a paragraph: from the last AI check of this exact text, or else the corrections
 * already proposed for it that still apply (the paragraph was edited since, e.g. another fix was used).
 */
export function cachedAiIssues(text: string, lang: TextLang): Issue[] {
  return aiCache.get(`${lang}\u0000${text}`) ?? (aiEdits[lang].length ? mergeIssues([verifyEdits(text, aiEdits[lang])], protectedRanges(text)) : []);
}

/** AI corrections first (most specific), then rules. */
export function combine(aiIssues: Issue[], rules: Issue[]): Issue[] {
  return mergeIssues([aiIssues, rules]);
}

/** Asks the AI for corrections to one paragraph and keeps only the ones Confi can verify. */
export async function aiProofread(text: string, lang: TextLang): Promise<Issue[]> {
  const key = `${lang}\u0000${text}`;
  const cached = aiCache.get(key);
  if (cached) return cached;
  const words = text.trim().split(/\s+/).length;
  let issues: Issue[] = [];
  if (words >= 3) {
    const reply = await ai.generate(proofreadMessages(text, lang), () => {}, Math.min(300, 40 + words * 4));
    issues = mergeIssues([verifyEdits(text, parseEdits(reply))], protectedRanges(text));
    for (const i of issues) aiEdits[lang].push({ wrong: i.text, right: i.suggestions[0] });
    aiEdits[lang].splice(0, Math.max(0, aiEdits[lang].length - 200));
  }
  aiCache.set(key, issues);
  return issues;
}

/** Protected details are never "corrected". Labels like "dossier" in "dossier 4482913" can be; the number can't. */
function protectedRanges(text: string) {
  return findSensitive(text)
    .map(detailValue)
    .map((m) => ({ start: m.index, end: m.index + m.text.length }));
}
