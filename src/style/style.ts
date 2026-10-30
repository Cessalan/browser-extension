import { detailValue, findSensitive, type SensitiveKind } from '../review/sensitive';
import type { TextLang } from '../review/prompts';

/**
 * "My style": examples of the person's own emails, so the AI writes like them instead of like an AI.
 * Opt-in, kept only on this device (IndexedDB), with names and numbers replaced by placeholders
 * before anything is saved. For each request, the few examples closest to the text are shown to the AI.
 */

export type StyleExample = { id: string; text: string; lang: TextLang; at: number };
export type StyleData = { enabled: boolean; examples: StyleExample[] };

export const MAX_EXAMPLES = 20;

const PLACEHOLDER: Record<TextLang, Record<SensitiveKind, string>> = {
  fr: { ssn: '[NAS]', nam: '[N° RAMQ]', mrn: '[N° dossier]', dob: '[date de naissance]', phone: '[téléphone]', email: '[courriel]', date: '[date]', id: '[numéro]', name: '[Nom]', address: '[adresse]', place: '[lieu]' },
  en: { ssn: '[SSN]', nam: '[health no.]', mrn: '[file no.]', dob: '[date of birth]', phone: '[phone]', email: '[email]', date: '[date]', id: '[number]', name: '[Name]', address: '[address]', place: '[place]' },
};

// Names the patterns and the AI may not have caught yet: after a title, or right after the greeting.
const TITLED = /\b(?:Dre?|Dr\.|Mme|Mlle|M\.|Mr\.?|Mrs\.?|Ms\.?|Madame|Monsieur|Docteure?|Doctor|Me|Maître)\s+(?:\p{Lu}[\p{L}'’-]+)(?:\s+\p{Lu}[\p{L}'’-]+)?/gu;
const GREETED = /^(\s*(?:Bonjour|Bonsoir|Allô|Salut|Cher|Chère|Hi|Hello|Dear|Good (?:morning|afternoon))\s+)(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)/u;

/** Replaces names, numbers and other details with neutral placeholders: what gets saved never identifies anyone. */
export function anonymize(text: string, lang: TextLang): string {
  let out = text;
  // Only the value: labels like "dossier" stay.
  for (const m of findSensitive(text).map(detailValue).reverse()) out = out.slice(0, m.index) + PLACEHOLDER[lang][m.kind] + out.slice(m.index + m.text.length);
  const name = PLACEHOLDER[lang].name;
  return out.replace(TITLED, name).replace(GREETED, (_, greeting: string, who: string) => (who === name.slice(1, -1) ? _ : greeting + name));
}

// ---- What the examples have in common (no AI: read from the text) ------------------------------

export type StyleProfile = { greeting?: string; signoff?: string; formality?: 'vous' | 'tu'; sentences?: 'short' | 'long' };

const firstLine = (t: string) => t.trim().split('\n')[0].trim();
const lastLines = (t: string) => t.trim().split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' ');

/** The most common value, if it shows up in at least half the examples. */
function usual(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return best && n >= Math.max(2, values.length / 2) ? best : undefined;
}

export function buildProfile(examples: StyleExample[]): StyleProfile {
  if (examples.length < 2) return {};
  // Greeting/sign-off shape: the words before a name placeholder or a comma ("Bonjour [Nom]," → "Bonjour …,").
  const shape = (s: string) => (s.length <= 40 ? s.replace(/\[[^\]]+\]/g, '…') : undefined);
  const fr = examples.filter((e) => e.lang === 'fr').map((e) => e.text).join(' ');
  const vous = (fr.match(/\bvous\b/gi) ?? []).length;
  const tu = (fr.match(/\b(tu|te|toi|ton|ta|tes)\b/gi) ?? []).length;
  const words = examples.flatMap((e) => e.text.split(/(?<=[.!?])\s+/)).map((s) => s.split(/\s+/).length);
  const avg = words.reduce((a, b) => a + b, 0) / Math.max(1, words.length);
  return {
    greeting: usual(examples.map((e) => shape(firstLine(e.text)))),
    signoff: usual(examples.map((e) => shape(lastLines(e.text)))),
    formality: vous + tu >= 3 ? (vous >= tu * 2 ? 'vous' : tu >= vous * 2 ? 'tu' : undefined) : undefined,
    sentences: words.length >= 6 ? (avg <= 14 ? 'short' : avg >= 24 ? 'long' : undefined) : undefined,
  };
}

// ---- Choosing examples for a request -------------------------------------------------------------

const wordsOf = (t: string) => new Set(t.toLowerCase().match(/\p{L}{4,}/gu) ?? []);

/** The examples closest to the text (same language first, then shared words), within a word budget. */
export function pickExamples(examples: StyleExample[], text: string, lang: TextLang, max = 3, budget = 450): StyleExample[] {
  const mine = wordsOf(text);
  const scored = examples
    .map((e) => {
      const theirs = wordsOf(e.text);
      let shared = 0;
      for (const w of mine) if (theirs.has(w)) shared++;
      return { e, score: (e.lang === lang ? 1000 : 0) + shared };
    })
    .sort((a, b) => b.score - a.score || b.e.at - a.e.at);
  const out: StyleExample[] = [];
  let used = 0;
  for (const { e } of scored) {
    const n = e.text.split(/\s+/).length;
    if (out.length >= max || (out.length > 0 && used + n > budget)) break;
    if (n > budget) continue; // one very long email would crowd out the rest
    out.push(e);
    used += n;
  }
  return out;
}

/** The part of the AI's instructions that makes it write like the person. Empty when off or nothing saved. */
export function styleInstructions(data: StyleData, text: string, lang: TextLang, max: number, budget: number): string {
  if (!data.enabled || data.examples.length === 0) return '';
  const p = buildProfile(data.examples);
  const habits = [
    p.greeting && (lang === 'fr' ? `salutation habituelle : « ${p.greeting} »` : `usual greeting: "${p.greeting}"`),
    p.signoff && (lang === 'fr' ? `formule de fin habituelle : « ${p.signoff} »` : `usual sign-off: "${p.signoff}"`),
    p.formality && lang === 'fr' && (p.formality === 'vous' ? 'vouvoie' : 'tutoie'),
    p.sentences && (lang === 'fr' ? (p.sentences === 'short' ? 'phrases courtes' : 'phrases longues') : p.sentences === 'short' ? 'short sentences' : 'long sentences'),
  ].filter(Boolean);
  const examples = pickExamples(data.examples, text, lang, max, budget);
  if (lang === 'fr') {
    return [
      'Écris comme cette personne, pas comme une IA : reprends son ton, ses tournures et sa longueur de phrases; évite les formules toutes faites.',
      habits.length ? `Ses habitudes : ${habits.join(', ')}.` : '',
      examples.length ? `Exemples de ses courriels (les [crochets] remplacent des renseignements) :\n${examples.map((e) => `---\n${e.text}`).join('\n')}\n---` : '',
    ].filter(Boolean).join('\n');
  }
  return [
    'Write like this person, not like an AI: match their tone, phrasing and sentence length; avoid stock phrases.',
    habits.length ? `Their habits: ${habits.join(', ')}.` : '',
    examples.length ? `Examples of their emails ([brackets] replace details):\n${examples.map((e) => `---\n${e.text}`).join('\n')}\n---` : '',
  ].filter(Boolean).join('\n');
}
