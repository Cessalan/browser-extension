import type { Message } from '../ai/engine';
import type { Key, Lang } from '../i18n';

const BASE = 'You help a hospital liaison nurse edit emails.';
const KEEP_FACTS =
  'Keep every name, date, time, number and fact exactly as written. Do not invent information. Reply with only the email text, no introduction or notes.';
// Emails carry formatting as Markdown; small models keep it when told explicitly.
const KEEP_FORMAT =
  'The email uses Markdown formatting (**bold**, *italic*, <u>underline</u>, ==highlight==, "- " bullet lists, "1." numbered lists). Keep this formatting where it still fits and reply in the same Markdown.';
// The nurse may write in English or French; never switch languages on them.
const SAME_LANGUAGE = 'Write in the same language as the email (English or French), unless the instruction asks for another language.';

export const REWRITES = [
  { id: 'clearer', label: 'rewrite.clearer', instruction: 'Rewrite this email so it is clear and easy to scan. Put the main request first.' },
  { id: 'professional', label: 'rewrite.professional', instruction: 'Rewrite this email in a polite, professional tone.' },
  { id: 'shorter', label: 'rewrite.shorter', instruction: 'Make this email shorter. Remove filler but keep every key fact and request.' },
  { id: 'fix', label: 'rewrite.fix', instruction: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
] as const satisfies readonly { id: string; label: Key; instruction: string }[];

export type RewriteId = (typeof REWRITES)[number]['id'];

export function rewriteMessages(id: RewriteId, draft: string): Message[] {
  const { instruction } = REWRITES.find((r) => r.id === id)!;
  return [
    { role: 'system', content: `${BASE} ${instruction} ${KEEP_FACTS} ${KEEP_FORMAT} ${SAME_LANGUAGE}` },
    { role: 'user', content: draft },
  ];
}

/** The nurse's own instruction, in any language ("put the request first", "rends-le plus chaleureux"…). */
export function customMessages(instruction: string, draft: string): Message[] {
  return [
    { role: 'system', content: `${BASE} Apply the nurse's instruction to the email. ${KEEP_FACTS} ${KEEP_FORMAT} ${SAME_LANGUAGE}` },
    { role: 'user', content: `Instruction: ${instruction.trim()}\n\nEmail:\n${draft}` },
  ];
}

export function reviewMessages(draft: string, lang: Lang): Message[] {
  const answerIn = lang === 'fr' ? 'Write the list in French.' : 'Write the list in English.';
  return [
    {
      role: 'system',
      content: `You help a hospital liaison nurse check an email before sending. The email may be in English or French. List up to 4 specific problems: unclear sentences, missing information the reader needs (dates, times, who does what, next steps), tone, or typos. One short line each, starting with "- ". If the email is fine, reply "- ${lang === 'fr' ? 'Tout est correct.' : 'Looks good.'}" Do not rewrite the email. ${answerIn}`,
    },
    { role: 'user', content: draft },
  ];
}

/** Turns the model's bullet list into separate items. */
export function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/** Removes chatter small models sometimes add around a rewrite ("Here is the rewritten email:", code fences). */
export function cleanRewrite(text: string): string {
  return text
    .replace(/^```\w*\n?|\n?```$/g, '')
    .replace(/^\s*(?:here(?:'s| is)|sure|certainly|voici|bien sûr|certainement)[^\n]*:\s*\n+/i, '')
    .trim();
}
