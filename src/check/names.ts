import { ai, type Message } from '../ai/engine';
import type { SensitiveKind } from '../review/sensitive';

/**
 * Finds what patterns can't: people's names, addresses and places tied to someone. The AI lists
 * them; Confi keeps only those really in the text, then protects them like file numbers.
 * Runs with Chrome's built-in AI (fast enough to run while the person types).
 */

const SYSTEM =
  'You find details in a text that could identify a specific person:\n' +
  '- names of people, with their title if written (e.g. "Mme Gagnon", "Dr. Patel", "Marc Tremblay");\n' +
  '- street addresses;\n' +
  '- room or bed numbers, and names of homes, clinics, schools or workplaces tied to that person.\n' +
  'Copy each one exactly as it appears in the text. Do not list roles without a name ("the patient", "la famille"), ' +
  'days, dates, phone numbers or file numbers. Reply in JSON; an empty list if there are none.';

export const NAMES_SCHEMA = {
  type: 'object',
  properties: {
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['name', 'address', 'place'] } },
        required: ['text', 'kind'],
      },
    },
  },
  required: ['details'],
};

export function namesMessages(text: string): Message[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: 'Bonjour Mme Gagnon, votre fils Marc passera au 123 rue Saint-Denis avant de voir le patient à la chambre 412.' },
    { role: 'assistant', content: '{"details":[{"text":"Mme Gagnon","kind":"name"},{"text":"Marc","kind":"name"},{"text":"123 rue Saint-Denis","kind":"address"},{"text":"chambre 412","kind":"place"}]}' },
    { role: 'user', content: text },
  ];
}

const TITLES = /^(?:dre?|dr\.|mme|mlle|m\.|mr\.?|mrs\.?|ms\.?|madame|monsieur|docteure?|doctor)$/i;

/**
 * Keeps only real findings: present word for word in the text, short, and looking like a proper noun
 * or an address (a capital letter or a digit), never a bare title or a common word.
 */
export function verifyNames(raw: string, text: string): { text: string; kind: SensitiveKind }[] {
  let items: { text?: unknown; kind?: unknown }[] = [];
  try {
    items = JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, '')).details ?? [];
  } catch {
    return [];
  }
  const out: { text: string; kind: SensitiveKind }[] = [];
  for (const item of items) {
    const value = typeof item.text === 'string' ? item.text.trim().replace(/[.,;:]+$/, '') : '';
    const kind = item.kind === 'address' || item.kind === 'place' ? item.kind : 'name';
    if (value.length < 2 || value.length > 80 || value.split(/\s+/).length > 8) continue;
    if (!/[\p{Lu}\d]/u.test(value) || TITLES.test(value)) continue;
    const at = text.indexOf(value);
    if (at < 0) continue;
    // Whole words only: "Marc" must not match inside "Marcel".
    if (/[\p{L}\p{N}]/u.test(text[at - 1] ?? '') || /[\p{L}\p{N}]/u.test(text[at + value.length] ?? '')) continue;
    if (!out.some((o) => o.text === value)) out.push({ text: value, kind });
  }
  return out;
}

const cache = new Map<string, { text: string; kind: SensitiveKind }[]>();

/** Names, addresses and places in the text (cached per text). */
export async function findNamesWithAi(text: string): Promise<{ text: string; kind: SensitiveKind }[]> {
  const cached = cache.get(text);
  if (cached) return cached;
  const raw = await ai.generate(namesMessages(text), () => {}, 400, NAMES_SCHEMA);
  const found = verifyNames(raw, text);
  // A reply cut short (stopped, page closing) isn't valid JSON: don't remember "no names" for this text.
  if (!isJson(raw)) return found;
  if (cache.size > 50) cache.clear();
  cache.set(text, found);
  return found;
}

function isJson(raw: string) {
  try {
    JSON.parse(raw.replace(/^\s*```(?:json)?|```\s*$/g, ''));
    return true;
  } catch {
    return false;
  }
}
