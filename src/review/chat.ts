import type { Message } from '../ai/engine';
import { lockDetails, unlockDetails } from '../ai/mask';
import { cleanRewrite, type TextLang } from './prompts';

/**
 * The assistant chat: the person says what they want ("warmer", "put the request first"), the AI
 * either asks one short question or proposes a new version of the text. It never edits the text
 * itself: a proposal is shown side by side and the person decides. Details stay locked as [X1].
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

const SYSTEM =
  'You are a writing assistant inside an app that helps people correct and improve professional messages ' +
  '(emails, notes, reports) that may contain confidential information.\n' +
  'Each request comes with the current text between <text> and </text>.\n' +
  '- If the request is clear: reply with one short sentence saying what you changed, then the full new version of the text between <text> and </text>.\n' +
  '- If something important is unclear: ask one short question, without <text>.\n' +
  '- If the request is a question about the text: answer briefly, without <text>.\n' +
  'Rules: write your own sentences in the language of the person’s request. Keep the text in its own language ({lang}) unless asked to translate. ' +
  'Keep markers like [X1] exactly as they are (they hide confidential details). Never invent facts, names, dates or numbers.';

const LANG_NAME: Record<TextLang, string> = { fr: 'French', en: 'English' };

/** Messages for the next turn: earlier requests and replies, then the request with the current text (details locked). */
export function chatMessages(history: ChatTurn[], request: string, text: string, lang: TextLang): { messages: Message[]; locked: Map<string, string> } {
  const { text: lockedText, locked } = lockDetails(text);
  return {
    locked,
    messages: [
      { role: 'system', content: SYSTEM.replace('{lang}', LANG_NAME[lang]) },
      ...history.map((t) => ({ role: t.role, content: t.content }) as Message),
      { role: 'user', content: `<text>\n${lockedText}\n</text>\n\n${request.trim()}` },
    ],
  };
}

/**
 * Splits a (possibly still streaming) reply into what the assistant says and the proposed text.
 * `writing` is true while the proposed text is still coming in.
 */
export function splitReply(raw: string): { say: string; text: string | null; writing: boolean } {
  const open = raw.indexOf('<text>');
  if (open < 0) return { say: raw.trim(), text: null, writing: false };
  const close = raw.indexOf('</text>', open);
  const say = (raw.slice(0, open) + (close >= 0 ? raw.slice(close + 7) : '')).trim();
  const body = raw.slice(open + 6, close >= 0 ? close : undefined);
  return { say, text: cleanRewrite(body), writing: close < 0 };
}

/** Puts the locked details back in a proposed text; null if the AI dropped one (the proposal is then set aside). */
export function unlockProposal(text: string, locked: Map<string, string>): string | null {
  const { text: out, missing } = unlockDetails(text, locked);
  return missing.length ? null : out;
}
