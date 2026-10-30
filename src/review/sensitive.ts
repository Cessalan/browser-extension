export type SensitiveKind = 'ssn' | 'nam' | 'mrn' | 'dob' | 'phone' | 'email' | 'date' | 'id';

export interface SensitiveMatch {
  kind: SensitiveKind;
  text: string;
  index: number;
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
  return found.sort((a, b) => a.index - b.index);
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
