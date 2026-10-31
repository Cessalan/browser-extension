import type { Issue } from './types';
import type { TextLang } from '../review/prompts';
// The package only exports its Node loader, so the dictionary files are imported by path.
import affUrl from '../../node_modules/dictionary-fr/index.aff?url';
import dicUrl from '../../node_modules/dictionary-fr/index.dic?url';

/**
 * Spelling and grammar without AI, off the main thread.
 * English: Harper (grammar + spelling engine). French: the LibreOffice/Hunspell dictionary (spelling); French grammar is Grammalecte, in its own worker (checker.ts).
 * Both load on first use (Harper ~2 s, the French dictionary ~5-10 s) and are cached by the service worker.
 */

export type SpellRequest = { id: number; lang: TextLang; text: string } | { id: number; warm: TextLang };
export type SpellResponse = { id: number; issues: Issue[] } | { id: number; error: string };

type Checker = (text: string) => Promise<Issue[]>;
const checkers: Partial<Record<TextLang, Promise<Checker>>> = {};

const KINDS: Record<string, Issue['kind']> = { Spelling: 'spelling', Typo: 'spelling', Capitalization: 'grammar' };

async function english(): Promise<Checker> {
  const { LocalLinter, Dialect } = await import('harper.js');
  const { binary } = await import('harper.js/binary');
  const linter = new LocalLinter({ binary, dialect: Dialect.Canadian });
  await linter.setup();
  return async (text) =>
    (await linter.lint(text, { language: 'plaintext' })).flatMap((lint): Issue[] => {
      const span = lint.span();
      const word = text.slice(span.start, span.end);
      const kind = KINDS[lint.lint_kind()] ?? 'grammar';
      // A capitalized word mid-sentence is probably a name: don't "correct" it.
      if (kind === 'spelling' && /^\p{Lu}/u.test(word) && span.start > 0) return [];
      const suggestions = lint
        .suggestions()
        .map((s) => (s.kind() === 2 ? word + s.get_replacement_text() : s.get_replacement_text()))
        .slice(0, 3);
      return [{ start: span.start, end: span.end, text: word, suggestions, kind, source: 'rules' }];
    });
}

async function french(): Promise<Checker> {
  const [{ default: nspell }, aff, dic] = await Promise.all([
    import('nspell'),
    fetch(affUrl).then((r) => r.text()),
    fetch(dicUrl).then((r) => r.text()),
  ]);
  const spell = nspell(aff, dic);
  // Everyday words missing from the dictionary.
  for (const w of ['ok', 'OK', 'email', 'emails', 'courriel', 'courriels', 'texto', 'wifi', 'Teams', 'Zoom', 'Outlook']) spell.add(w);
  const known = (w: string) => spell.correct(w) || spell.correct(w.toLowerCase());
  return async (text) => {
    const issues: Issue[] = [];
    // Words, with elisions split off ("l'eval" → "eval") and hyphenated words checked whole, then by part.
    for (const m of text.matchAll(/[\p{L}]+(?:[-][\p{L}]+)*/gu)) {
      const word = m[0];
      const at = m.index;
      const before = text[at - 1] ?? '';
      if (word.length < 2 || /\d/.test(text.slice(at - 1, at + word.length + 1))) continue;
      if (word === word.toUpperCase()) continue; // acronyms
      // Capitalized mid-sentence: probably a name.
      const sentenceStart = at === 0 || /[.!?]\s*$/.test(text.slice(Math.max(0, at - 3), at)) || before === '\n';
      if (/^\p{Lu}/u.test(word) && !sentenceStart) continue;
      if (known(word) || (word.includes('-') && word.split('-').every(known))) continue;
      // "l'", "qu'", "jusqu'" etc. are separate tokens; the word after them is checked on its own.
      issues.push({ start: at, end: at + word.length, text: word, suggestions: spell.suggest(word).slice(0, 3), kind: 'spelling', source: 'rules' });
    }
    return issues;
  };
}

function checker(lang: TextLang) {
  return (checkers[lang] ??= lang === 'fr' ? french() : english());
}

self.onmessage = async (e: MessageEvent<SpellRequest>) => {
  const req = e.data;
  try {
    if ('warm' in req) {
      await checker(req.warm);
      self.postMessage({ id: req.id, issues: [] } satisfies SpellResponse);
    } else {
      self.postMessage({ id: req.id, issues: await (await checker(req.lang))(req.text) } satisfies SpellResponse);
    }
  } catch (err) {
    self.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) } satisfies SpellResponse);
  }
};
