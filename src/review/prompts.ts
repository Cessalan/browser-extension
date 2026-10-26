import type { Message } from '../ai/engine';
import type { Key, Lang } from '../i18n';

/*
 * Prompts are written for the smallest models: short rules in the text's own language, one worked
 * example per task (before → after), and the person's text clearly marked. Small models follow a
 * shown example far better than a long description, and stay in the language they're addressed in.
 */

export type TextLang = 'en' | 'fr';

const FR_HINTS = /\b(le|la|les|des|une|est|pour|que|qui|dans|avec|pas|vous|nous|je|il|elle|sur|aux|du|ce|cette|merci|bonjour)\b/gi;
const EN_HINTS = /\b(the|and|is|are|for|that|with|you|we|this|to|of|in|on|thanks|hi|hello|please)\b/gi;

/** English or French, from common words (accents tip a close call to French). */
export function detectTextLang(text: string): TextLang {
  const fr = text.match(FR_HINTS)?.length ?? 0;
  const en = text.match(EN_HINTS)?.length ?? 0;
  if (fr === en) return /[àâçéèêëîïôûùü]/i.test(text) ? 'fr' : 'en';
  return fr > en ? 'fr' : 'en';
}

const RULES: Record<TextLang, { base: string; keep: string; format: string }> = {
  en: {
    base: 'You edit texts written by professionals. They may contain confidential details.',
    keep: 'Keep every name, number, date, time, fact and marker like [X1] exactly as written. Do not add information. Reply with only the edited text.',
    format: 'Keep the Markdown formatting (**bold**, *italic*, lists) where it fits.',
  },
  fr: {
    base: 'Tu révises des textes écrits par des professionnels. Ils peuvent contenir des renseignements confidentiels.',
    keep: 'Garde chaque nom, nombre, date, heure, fait et marqueur comme [X1] exactement tel quel. N’ajoute aucune information. Réponds uniquement avec le texte révisé.',
    format: 'Garde la mise en forme Markdown (**gras**, *italique*, listes) quand elle convient.',
  },
};

export const REWRITES = [
  { id: 'clearer', label: 'rewrite.clearer' },
  { id: 'professional', label: 'rewrite.professional' },
  { id: 'shorter', label: 'rewrite.shorter' },
  { id: 'fix', label: 'rewrite.fix' },
] as const satisfies readonly { id: string; label: Key }[];

export type RewriteId = (typeof REWRITES)[number]['id'];

/** Instruction + one made-up worked example per task and language. Never real data. */
const TASKS: Record<RewriteId, Record<TextLang, { instruction: string; example: [string, string] }>> = {
  fix: {
    en: {
      instruction: 'Fix the spelling, grammar and punctuation. Change nothing else.',
      example: [
        'hi sam, i wanted to confirm that the meeting is tomorow at 2pm. can you let me knwo if your available',
        'Hi Sam, I wanted to confirm that the meeting is tomorrow at 2 p.m. Can you let me know if you’re available?',
      ],
    },
    fr: {
      instruction: 'Corrige l’orthographe, la grammaire et la ponctuation. Ne change rien d’autre.',
      example: [
        'bonjour marie, je voulais confirmé que la rencontre est demain a 14h. pouvez vous me dire si vous etes disponible',
        'Bonjour Marie, je voulais confirmer que la rencontre est demain à 14 h. Pouvez-vous me dire si vous êtes disponible ?',
      ],
    },
  },
  professional: {
    en: {
      instruction: 'Rewrite the text in a polite, professional tone.',
      example: ['hey, the report is late again. send it asap.', 'Hello, the report has not arrived yet. Could you please send it as soon as possible?'],
    },
    fr: {
      instruction: 'Réécris le texte sur un ton poli et professionnel.',
      example: ['salut, le rapport est encore en retard. envoie-le au plus vite.', 'Bonjour, le rapport n’est pas encore arrivé. Pourriez-vous l’envoyer dès que possible ?'],
    },
  },
  shorter: {
    en: {
      instruction: 'Make the text shorter. Keep every important fact and request.',
      example: [
        'I just wanted to reach out to let you know that, as we discussed earlier today, the meeting has been moved to Thursday at 10 a.m. Please let me know if that works for you.',
        'As discussed, the meeting is moved to Thursday at 10 a.m. Does that work for you?',
      ],
    },
    fr: {
      instruction: 'Rends le texte plus court. Garde chaque fait et chaque demande importants.',
      example: [
        'Je voulais simplement vous écrire pour vous informer que, comme nous en avons discuté plus tôt aujourd’hui, la rencontre a été déplacée à jeudi à 10 h. Merci de me dire si cela vous convient.',
        'Comme convenu, la rencontre est déplacée à jeudi à 10 h. Cela vous convient-il ?',
      ],
    },
  },
  clearer: {
    en: {
      instruction: 'Rewrite the text so it is clear and easy to read. Put the main request first.',
      example: [
        'so about tuesday, i think we said maybe the file could go out but the form is missing, can you sign it?',
        'Could you sign the form? It is the only thing missing before the file goes out on Tuesday.',
      ],
    },
    fr: {
      instruction: 'Réécris le texte pour qu’il soit clair et facile à lire. Mets la demande principale en premier.',
      example: [
        'donc pour mardi, je pense qu’on avait dit que le dossier pourrait partir mais il manque le formulaire, pouvez-vous le signer?',
        'Pourriez-vous signer le formulaire ? C’est la seule chose qui manque pour que le dossier parte mardi.',
      ],
    },
  },
};

/** Marks the person's text clearly, so small models edit it instead of treating it as a request. */
function wrap(text: string) {
  return `<text>\n${text}\n</text>`;
}

export function rewriteMessages(id: RewriteId, text: string): Message[] {
  const lang = detectTextLang(text);
  const { base, keep, format } = RULES[lang];
  const { instruction, example } = TASKS[id][lang];
  return [
    { role: 'system', content: `${base} ${instruction} ${keep} ${format}` },
    { role: 'user', content: `${instruction}\n\n${wrap(example[0])}` },
    { role: 'assistant', content: example[1] },
    { role: 'user', content: `${instruction}\n\n${wrap(text)}` },
  ];
}

/** The person's own instruction, in any language ("put the request first", "rends-le plus chaleureux"…). */
export function customMessages(instruction: string, text: string): Message[] {
  const lang = detectTextLang(text);
  const { base, keep, format } = RULES[lang];
  const apply = lang === 'fr' ? 'Applique la consigne de la personne au texte.' : 'Apply the person’s instruction to the text.';
  return [
    { role: 'system', content: `${base} ${apply} ${keep} ${format}` },
    { role: 'user', content: `Instruction: ${instruction.trim()}\n\n${wrap(text)}` },
  ];
}

export function reviewMessages(draft: string, lang: Lang): Message[] {
  const answerIn = lang === 'fr' ? 'Write the list in French.' : 'Write the list in English.';
  return [
    {
      role: 'system',
      content: `You help a professional check a text (an email, a note or a report) before it is sent or filed. The text may be in English or French. List up to 4 specific problems: unclear sentences, missing information the reader needs (dates, times, who does what, next steps), tone, or typos. One short line each, starting with "- ". If the text is fine, reply "- ${lang === 'fr' ? 'Tout est correct.' : 'Looks good.'}" Do not rewrite the text. ${answerIn}`,
    },
    { role: 'user', content: `Check this text:\n\n${wrap(draft)}` },
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
    .replace(/<\/?text>/g, '')
    .replace(/^\s*(?:here(?:'s| is)|sure|certainly|voici|bien sûr|certainement)[^\n]*:\s*\n+/i, '')
    .trim();
}
