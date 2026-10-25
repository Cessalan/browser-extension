import type { Message } from '../ai/engine';

const KEEP_FACTS =
  'Keep every name, date, time, number and fact exactly as written. Do not invent information. Reply with only the email text, no introduction or notes.';

export const REWRITES = [
  { id: 'clearer', label: 'Clearer', instruction: 'Rewrite this email so it is clear and easy to scan. Put the main request first.' },
  { id: 'professional', label: 'More professional', instruction: 'Rewrite this email in a polite, professional tone.' },
  { id: 'shorter', label: 'Shorter', instruction: 'Make this email shorter. Remove filler but keep every key fact and request.' },
  { id: 'fix', label: 'Fix spelling & grammar', instruction: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
] as const;

export type RewriteId = (typeof REWRITES)[number]['id'];

export function rewriteMessages(id: RewriteId, draft: string): Message[] {
  const { instruction } = REWRITES.find((r) => r.id === id)!;
  return [
    { role: 'system', content: `You help a hospital liaison nurse edit emails. ${instruction} ${KEEP_FACTS}` },
    { role: 'user', content: draft },
  ];
}

export function reviewMessages(draft: string): Message[] {
  return [
    {
      role: 'system',
      content:
        'You help a hospital liaison nurse check an email before sending. List up to 4 specific problems: unclear sentences, missing information the reader needs (dates, times, who does what, next steps), tone, or typos. One short line each, starting with "- ". If the email is fine, reply "- Looks good." Do not rewrite the email.',
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
    .replace(/^\s*(?:here(?:'s| is)|sure|certainly)[^\n]*:\s*\n+/i, '')
    .trim();
}
