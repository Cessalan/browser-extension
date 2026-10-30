import type { Message } from '../ai/engine';
import { lockDetails, unlockDetails } from '../ai/mask';
import { cleanRewrite, type TextLang } from './prompts';
import { getStyle } from '../style/store';
import { styleInstructions } from '../style/style';

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
  'Reply in JSON with two fields:\n' +
  '- "say": one or two short sentences to the person: what you changed, or your question, or your answer. Never put the text itself here.\n' +
  '- "text": the full new version of the text if you changed it; an empty string if you are only asking or answering a question.\n' +
  'Ask a question only if something important is unclear. ' +
  'Write "say" in {replyLang}. Keep the text in its own language ({lang}) unless asked to translate. ' +
  'Keep markers like [X1] exactly as they are (they hide confidential details). ' +
  'Never invent facts, names, dates or numbers, and never add placeholders like [Name].';

/** The reply format, enforced by Chrome's AI (other AIs follow the prompt; `splitReply` copes with both). */
export const CHAT_SCHEMA = {
  type: 'object',
  properties: { say: { type: 'string' }, text: { type: 'string' } },
  required: ['say', 'text'],
  additionalProperties: false,
};

const LANG_NAME: Record<TextLang, string> = { fr: 'French', en: 'English' };

/** Messages for the next turn: earlier requests and replies, then the request with the current text (details locked). */
/**
 * `lang`: the text's language. `replyLang`: the language the assistant speaks in: the person's browser
 * language, or the one they switched to in the conversation.
 */
export function chatMessages(
  history: ChatTurn[],
  request: string,
  text: string,
  lang: TextLang,
  replyLang: TextLang,
): { messages: Message[]; locked: Map<string, string> } {
  const { text: lockedText, locked } = lockDetails(text);
  return {
    locked,
    messages: [
      {
        role: 'system',
        content: [SYSTEM.replace('{lang}', LANG_NAME[lang]).replace('{replyLang}', LANG_NAME[replyLang]), styleInstructions(getStyle(), text, lang, 4, 600)]
          .filter(Boolean)
          .join('\n\n'),
      },
      ...history.map((t) => ({ role: t.role, content: t.content }) as Message),
      { role: 'user', content: `<text>\n${lockedText}\n</text>\n\n${request.trim()}` },
    ],
  };
}

/** Reads a string field from JSON that may still be streaming in (unfinished at the end). */
function jsonField(raw: string, key: string): { value: string; closed: boolean } | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!m) return null;
  let out = '';
  for (let i = m.index + m[0].length; i < raw.length; ) {
    const c = raw[i];
    if (c === '"') return { value: out, closed: true };
    if (c !== '\\') {
      out += c;
      i++;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
    } else {
      out += ({ n: '\n', t: '\t', r: '' } as Record<string, string>)[next] ?? next;
      i += 2;
    }
  }
  return { value: out, closed: false };
}

/**
 * Splits a (possibly still streaming) reply into what the assistant says and the proposed text.
 * Understands the JSON reply, the older "<text>…</text>" form, and, as a last resort, a reply that
 * is a sentence followed by a whole new version (`originalWords` tells how long a full version is).
 * `writing` is true while the proposed text is still coming in.
 */
export function splitReply(raw: string, originalWords = 0): { say: string; text: string | null; writing: boolean } {
  if (/^\s*(?:```(?:json)?\s*)?\{/.test(raw)) {
    const say = jsonField(raw, 'say');
    const text = jsonField(raw, 'text');
    return { say: say?.value.trim() ?? '', text: text?.value.trim() ? cleanRewrite(text.value) : null, writing: !!text && !text.closed };
  }
  const open = raw.indexOf('<text>');
  if (open >= 0) {
    const close = raw.indexOf('</text>', open);
    const say = (raw.slice(0, open) + (close >= 0 ? raw.slice(close + 7) : '')).trim();
    const body = raw.slice(open + 6, close >= 0 ? close : undefined);
    return { say, text: cleanRewrite(body), writing: close < 0 };
  }
  // No format at all: "I made it warmer.\n\nDear Dr. Patel, …" → the part after the first paragraph is the new version.
  const [first, ...rest] = raw.trim().split(/\n\s*\n/);
  const body = rest.join('\n\n').trim();
  if (originalWords > 0 && body && body.split(/\s+/).length >= originalWords * 0.5) return { say: first.trim(), text: body, writing: false };
  return { say: raw.trim(), text: null, writing: false };
}

/** Puts the locked details back in a proposed text; null if the AI dropped one (the proposal is then set aside). */
export function unlockProposal(text: string, locked: Map<string, string>): string | null {
  const { text: out, missing } = unlockDetails(text, locked);
  return missing.length ? null : out;
}
