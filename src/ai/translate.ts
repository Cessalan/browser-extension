import { ai, type Message } from './engine';
import { dropMarkers, lockDetails, markersIn, unlockDetails } from './mask';
import { cleanRewrite, type TextLang } from '../review/prompts';
import { UnreliableError } from '../review/rewrite';

/**
 * French ↔ English translation, on this computer.
 * Uses Chrome's built-in translator when available (a dedicated translation model: fast and accurate,
 * downloaded once by Chrome per language pair); otherwise asks Confi's own AI.
 * Protected details are locked as [X1] markers first, so numbers and identifiers can't be altered.
 */

type ChromeTranslator = { translate(text: string): Promise<string> };
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<ChromeTranslator>;
}

const translators = new Map<string, Promise<ChromeTranslator | null>>();

/** Chrome's translator for this pair, or null if this browser doesn't have one. */
function chromeTranslator(from: TextLang, to: TextLang): Promise<ChromeTranslator | null> {
  const key = `${from}>${to}`;
  let t = translators.get(key);
  if (!t) {
    t = (async () => {
      const T = (globalThis as { Translator?: TranslatorApi }).Translator;
      if (!T) return null;
      const pair = { sourceLanguage: from, targetLanguage: to };
      if ((await T.availability(pair).catch(() => 'unavailable')) === 'unavailable') return null;
      return T.create(pair).catch(() => null);
    })();
    translators.set(key, t);
    // Not available (yet): ask again next time rather than remembering the failure.
    void t.then((ready) => ready || translators.delete(key));
  }
  return t;
}

const PROMPTS: Record<TextLang, { system: string; example: [string, string] }> = {
  en: {
    system:
      'Translate the text between <text> and </text> into English. Keep names, numbers and markers like [X1] exactly as they are. ' +
      'Keep the same tone and meaning. Reply with the translation only.',
    example: ['Pouvez-vous confirmer le rendez-vous de [X1] jeudi? Merci beaucoup.', 'Can you confirm the appointment for [X1] on Thursday? Thank you very much.'],
  },
  fr: {
    system:
      'Traduis le texte entre <text> et </text> en français. Garde les noms, les nombres et les marqueurs comme [X1] exactement tels quels. ' +
      'Garde le même ton et le même sens. Réponds seulement avec la traduction.',
    example: ['Can you confirm the appointment for [X1] on Thursday? Thank you very much.', 'Pouvez-vous confirmer le rendez-vous de [X1] jeudi? Merci beaucoup.'],
  },
};

async function aiTranslate(text: string, to: TextLang): Promise<string> {
  const p = PROMPTS[to];
  const wrap = (s: string) => `<text>\n${s}\n</text>`;
  const messages: Message[] = [
    { role: 'system', content: p.system },
    { role: 'user', content: wrap(p.example[0]) },
    { role: 'assistant', content: p.example[1] },
    { role: 'user', content: wrap(text) },
  ];
  const words = text.trim().split(/\s+/).length;
  return cleanRewrite(await ai.generate(messages, () => {}, Math.min(1500, words * 3 + 60)));
}

/**
 * Translates a Markdown draft line by line, keeping bullets, numbering and blank lines.
 * `onText` gets the translation so far. Throws UnreliableError if the AI lost a protected detail
 * or produced something far too short or long to be a translation.
 */
export async function translateText(markdown: string, from: TextLang, to: TextLang, onText: (text: string) => void): Promise<string> {
  const { text: locked, locked: details } = lockDetails(markdown);
  const chrome = await chromeTranslator(from, to);
  const out: string[] = [];
  for (const line of locked.split('\n')) {
    const [, prefix = '', content] = /^(\s*(?:[-*]|\d+\.)\s+)?([\s\S]*)$/.exec(line)!;
    if (!/\p{L}/u.test(content)) {
      out.push(line);
      continue;
    }
    let translated = chrome ? await chrome.translate(content) : await aiTranslate(content, to);
    translated = dropMarkers(translated.replace(/\[\s*x\s*(\d+)\s*\]/gi, '[X$1]'), markersIn(content)).trim();
    const ratio = translated.split(/\s+/).length / content.trim().split(/\s+/).length;
    const keptDetails = markersIn(content).every((m) => translated.includes(m));
    if (!keptDetails || (!chrome && (ratio < 0.4 || ratio > 2.5))) throw new UnreliableError();
    out.push(prefix + translated);
    onText(unlockDetails(out.join('\n'), details).text);
  }
  return unlockDetails(out.join('\n'), details).text;
}
