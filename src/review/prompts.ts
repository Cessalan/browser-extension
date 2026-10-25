import type { Message } from '../ai/engine';
import type { Key, Lang } from '../i18n';

const BASE = 'You help a professional edit a text (an email, a note or a report) that may contain confidential details.';
const KEEP_FACTS =
  'Keep every name, date, time, number and fact exactly as written. Do not invent information. Reply with only the edited text, no introduction or notes.';
// Emails carry formatting as Markdown; small models keep it when told explicitly.
const KEEP_FORMAT =
  'The text uses Markdown formatting (**bold**, *italic*, <u>underline</u>, ==highlight==, "- " bullet lists, "1." numbered lists). Keep this formatting where it still fits and reply in the same Markdown.';
// People may write in English or French; never switch languages on them.
const SAME_LANGUAGE = 'Write in the same language as the text (English or French), unless the instruction asks for another language.';

export const REWRITES = [
  { id: 'clearer', label: 'rewrite.clearer', instruction: 'Rewrite this text so it is clear and easy to scan. Put the main point or request first.' },
  { id: 'professional', label: 'rewrite.professional', instruction: 'Rewrite this text in a polite, professional tone.' },
  { id: 'shorter', label: 'rewrite.shorter', instruction: 'Make this text shorter. Remove filler but keep every key fact and request.' },
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

/** The person's own instruction, in any language ("put the request first", "rends-le plus chaleureux"…). */
export function customMessages(instruction: string, draft: string): Message[] {
  return [
    { role: 'system', content: `${BASE} Apply the person's instruction to the text. ${KEEP_FACTS} ${KEEP_FORMAT} ${SAME_LANGUAGE}` },
    { role: 'user', content: `Instruction: ${instruction.trim()}\n\nEmail:\n${draft}` },
  ];
}

export function reviewMessages(draft: string, lang: Lang): Message[] {
  const answerIn = lang === 'fr' ? 'Write the list in French.' : 'Write the list in English.';
  return [
    {
      role: 'system',
      content: `You help a professional check a text (an email, a note or a report) before it is sent or filed. The text may be in English or French. List up to 4 specific problems: unclear sentences, missing information the reader needs (dates, times, who does what, next steps), tone, or typos. One short line each, starting with "- ". If the text is fine, reply "- ${lang === 'fr' ? 'Tout est correct.' : 'Looks good.'}" Do not rewrite the text. ${answerIn}`,
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
