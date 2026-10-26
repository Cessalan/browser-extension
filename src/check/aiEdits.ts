import type { Message } from '../ai/engine';
import { lockDetails } from '../ai/mask';
import type { TextLang } from '../review/prompts';
import type { Issue } from './types';

/**
 * The AI as a proofreader, not a writer: it lists small corrections ("wrong => right") and Confi
 * keeps only the ones it can verify. The person's text is never replaced wholesale, so a confused
 * model can't make it worse: a bad suggestion is simply dropped.
 */

const PROMPTS: Record<TextLang, { system: string; example: [string, string] }> = {
  fr: {
    system:
      'Tu es correcteur. Trouve les fautes d’orthographe, de grammaire, d’accord, de conjugaison et de ponctuation dans le texte. ' +
      'Pour chaque faute, écris une ligne : mots fautifs => mots corrigés. Recopie les mots fautifs exactement comme dans le texte. ' +
      'Change le moins de mots possible. Ne réécris pas les phrases, ne change pas le style ni les noms. Les marqueurs comme [X1] restent tels quels. ' +
      'S’il n’y a aucune faute, réponds : OK',
    example: [
      'les resultats sont arrivé hier, pouvez vous les envoyer au [X1]?',
      'resultats => résultats\nsont arrivé => sont arrivés\npouvez vous => pouvez-vous',
    ],
  },
  en: {
    system:
      'You are a proofreader. Find spelling, grammar, agreement, tense and punctuation mistakes in the text. ' +
      'For each mistake, write one line: wrong words => corrected words. Copy the wrong words exactly as they appear in the text. ' +
      'Change as few words as possible. Do not rewrite sentences, do not change the style or names. Markers like [X1] stay as they are. ' +
      'If there are no mistakes, reply: OK',
    example: [
      'the results was sent yesterday, can you forward them to [X1]? i dont have there number.',
      'results was => results were\ni dont => I don’t\nthere number => their number',
    ],
  },
};

/** Messages asking the AI for corrections to one paragraph (its details locked as [X1] markers). */
export function proofreadMessages(paragraph: string, lang: TextLang): Message[] {
  const p = PROMPTS[lang];
  const { text } = lockDetails(paragraph);
  return [
    { role: 'system', content: p.system },
    { role: 'user', content: p.example[0] },
    { role: 'assistant', content: p.example[1] },
    { role: 'user', content: text },
  ];
}

/** Reads "wrong => right" lines, tolerating bullets, quotes and other arrows. */
export function parseEdits(reply: string): { wrong: string; right: string }[] {
  const edits: { wrong: string; right: string }[] = [];
  for (const line of reply.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+[.)])?\s*(.+?)\s*(?:=>|→|->|⇒)\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const unquote = (s: string) => s.replace(/^["'«“‘]\s*|\s*["'»”’]$/g, '');
    edits.push({ wrong: unquote(m[1]), right: unquote(m[2]) });
  }
  return edits;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const wordCount = (s: string) => s.trim().split(/\s+/).length;

/**
 * Keeps only corrections that are real, small and safe:
 * - the wrong words are actually in the paragraph (the AI didn't invent them);
 * - the change is a few words and a few letters (a correction, not a rewrite);
 * - no protected detail or [X1] marker is involved.
 */
export function verifyEdits(paragraph: string, edits: { wrong: string; right: string }[]): Issue[] {
  const issues: Issue[] = [];
  for (const { wrong, right } of edits) {
    if (!wrong || wrong === right) continue;
    if (/\[\s*x\d+\s*\]/i.test(wrong + right)) continue;
    if (wordCount(wrong) > 5 || wordCount(right) > 6 || Math.abs(wordCount(wrong) - wordCount(right)) > 2) continue;
    const distance = editDistance(wrong.toLowerCase(), right.toLowerCase());
    if (distance > Math.max(3, Math.ceil(Math.max(wrong.length, right.length) * 0.4))) continue;
    // First occurrence not already corrected, on word boundaries.
    let start = -1;
    for (let from = 0; ; ) {
      const i = paragraph.indexOf(wrong, from);
      if (i < 0) break;
      const before = paragraph[i - 1] ?? ' ';
      const after = paragraph[i + wrong.length] ?? ' ';
      const free = !issues.some((x) => i < x.end && x.start < i + wrong.length);
      // Already corrected: "orders are signed" inside "the orders are signed".
      const k = right.indexOf(wrong);
      const done = k >= 0 && paragraph.slice(i - k, i - k + right.length) === right;
      if (done) {
        from = i + 1;
        continue;
      }
      if (free && !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
        start = i;
        break;
      }
      from = i + 1;
    }
    if (start < 0) {
      // The same words with a capital first letter (now at a sentence start): fix them the same way.
      const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      if (upper(wrong) !== wrong) issues.push(...verifyEdits(paragraph, [{ wrong: upper(wrong), right: upper(right) }]).filter((x) => !issues.some((i) => x.start < i.end && i.start < x.end)));
      continue;
    }
    issues.push({ start, end: start + wrong.length, text: wrong, suggestions: [right], kind: 'grammar', source: 'ai' });
  }
  return issues;
}
