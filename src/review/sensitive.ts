export type SensitiveKind = 'ssn' | 'nam' | 'mrn' | 'dob' | 'phone' | 'email' | 'date' | 'id' | 'name' | 'address' | 'place';

export interface SensitiveMatch {
  kind: SensitiveKind;
  text: string;
  index: number;
  /** Found by the AI (a name, an address…) rather than by a pattern; the person can un-protect it. */
  learned?: true;
}

// Ordered by priority: when two patterns overlap, the earlier one wins. Covers English and French (Quebec) wording.
const PATTERNS: { kind: SensitiveKind; re: RegExp }[] = [
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Quebec health insurance number (NAM / RAMQ): 4 letters + 8 digits.
  { kind: 'nam', re: /\b[A-Z]{4}\s?\d{4}\s?\d{4}\b/g },
  { kind: 'mrn', re: /(?:\bMRN|\bmedical record(?: number| no\.?)?|\bn(?:o|°|º)\.?\s*(?:de\s+)?dossier|\bdossier)\s*[#:]?\s*[A-Z0-9-]{4,}\b/gi },
  { kind: 'dob', re: /(?:\bDOB|\bD\.O\.B\.|\bdate of birth|\bborn|\bDDN|\bdate de naissance|\bné(?:e)? le)\s*[:#]?\s*[\d/.-]{6,10}\b/gi },
  { kind: 'phone', re: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { kind: 'date', re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g },
  { kind: 'id', re: /\b\d{7,}\b/g },
];

/**
 * Finds details that could identify a person (patient, client, employee), so the user can double-check
 * before sending. Plain pattern matching: instant, and nothing leaves the page.
 */
export function findSensitive(text: string): SensitiveMatch[] {
  const found: SensitiveMatch[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = found.some((f) => start < f.index + f.text.length && f.index < end);
      if (!overlaps) found.push({ kind, text: m[0].trim(), index: start });
    }
  }
  // Names, addresses and places the AI found, wherever they appear (longest first: "Marc Tremblay" before "Tremblay").
  for (const [value, kind] of [...learned].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of text.matchAll(re)) {
      const end = m.index + m[0].length;
      if (!found.some((f) => m.index < f.index + f.text.length && f.index < end)) found.push({ kind, text: m[0], index: m.index, learned: true });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Details the AI found in this session (src/check/names.ts). Memory only, like the draft. */
const learned = new Map<string, SensitiveKind>();
/** Details the person said aren't private: never protected again in this session. */
const forgotten = new Set<string>();

/** Adds details found by the AI. Returns true if any is new. */
export function learnDetails(items: { text: string; kind: SensitiveKind }[]): boolean {
  let added = false;
  for (const { text, kind } of items) {
    if (learned.has(text) || forgotten.has(text)) continue;
    learned.set(text, kind);
    added = true;
  }
  return added;
}

/** Stops protecting a detail the AI found (it wasn't sensitive, e.g. a product name). */
export function forgetDetail(text: string) {
  learned.delete(text);
  forgotten.add(text);
}

/**
 * The identifying value inside a match, without its label: "4482913" in "dossier 4482913",
 * "14/03/1952" in "né le 14/03/1952". Labels can be translated or corrected; values never are.
 */
export function detailValue(m: SensitiveMatch): SensitiveMatch {
  if (m.kind !== 'mrn' && m.kind !== 'dob') return m;
  const label = /^[^\d]*?(?=[A-Z0-9-]*\d[\w/.-]*$)/u.exec(m.text)?.[0] ?? '';
  return { ...m, index: m.index + label.length, text: m.text.slice(label.length) };
}
