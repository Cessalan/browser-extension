import type { TextLang } from '../review/prompts';
import type { Issue } from './types';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const issue = (start: number, text: string, fix: string, kind: Issue['kind'] = 'grammar'): Issue => ({
  start,
  end: start + text.length,
  text,
  suggestions: [fix],
  kind,
  source: 'rules',
});

/**
 * A few sure-fire checks that need no dictionary: repeated words, doubled spaces, a space before a
 * comma or period, and a sentence starting in lowercase.
 */
export function findBasics(text: string, lang: TextLang): Issue[] {
  const issues: Issue[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(\p{L}+)\s+\1(?![\p{L}\p{N}])/giu)) {
    // "le le" → "le". Exception: "nous nous", "vous vous" are correct French.
    if (lang === 'fr' && /^(nous|vous)$/i.test(m[1])) continue;
    issues.push(issue(m.index, m[0], m[1]));
  }
  for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) issues.push(issue(m.index, m[0], ' '));
  for (const m of text.matchAll(/(?<=\p{L}) +(?=[,.](?:\s|$))/gu)) issues.push(issue(m.index, m[0], ''));
  for (const m of text.matchAll(/(?:^|[.!?]\s+)(\p{Ll}[\p{L}’'-]*)/gu)) {
    const at = m.index + m[0].length - m[1].length;
    issues.push(issue(at, m[1], capitalize(m[1])));
  }
  return issues;
}
