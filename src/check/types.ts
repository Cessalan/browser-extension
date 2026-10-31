/**
 * A suggested correction to one stretch of text, like Antidote or a spell checker: shown as an
 * underline, fixed with one click. Positions are offsets in one paragraph's plain text.
 */
export interface Issue {
  start: number;
  end: number;
  /** The text being corrected (text.slice(start, end) when the issue was found). */
  text: string;
  /** Best first. Empty when there is no sure fix (still worth underlining). */
  suggestions: string[];
  kind: IssueKind;
  /** Why it's a mistake, when the engine explains it (Grammalecte, in French). */
  message?: string;
  /** 'rules': spelling/grammar engines and our word lists, no AI. 'ai': a small edit proposed by the AI and checked by Confi. */
  source: 'rules' | 'ai';
}

export type IssueKind = 'spelling' | 'grammar' | 'shorthand';

/**
 * Keeps the first issue of any that overlap (callers pass the most trusted ones first) and drops
 * issues touching protected details: Confi never suggests changing a file number or a phone number.
 */
export function mergeIssues(groups: Issue[][], protectedRanges: { start: number; end: number }[] = []): Issue[] {
  const kept: Issue[] = [];
  const all = groups.flat();
  // A correction starting where a sentence needs a capital ("pt" → "patient" at the start) gets the capital too.
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const onlyCapital = (i: Issue) => i.text !== i.suggestions[0] && i.suggestions[0] === capitalize(i.text);
  const capitalAt = new Set(all.filter(onlyCapital).map((i) => i.start));
  const withCapital = (i: Issue): Issue =>
    capitalAt.has(i.start) && !onlyCapital(i) ? { ...i, suggestions: i.suggestions.map(capitalize) } : i;
  const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
  for (const issue of all.map(withCapital)) {
    if (issue.suggestions.length === 0 && issue.kind !== 'spelling') continue;
    if (protectedRanges.some((r) => overlaps(r, issue))) continue;
    if (kept.some((k) => overlaps(k, issue))) continue;
    kept.push(issue);
  }
  return kept.sort((a, b) => a.start - b.start);
}
