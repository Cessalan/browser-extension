export interface SensitiveMatch {
  kind: string;
  text: string;
  index: number;
}

// Ordered by priority: when two patterns overlap, the earlier one wins.
const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'Medical record number', re: /\b(?:MRN|medical record(?: number| no\.?)?)\s*[#:]?\s*[A-Z0-9-]{4,}\b/gi },
  { kind: 'Date of birth', re: /\b(?:DOB|D\.O\.B\.|date of birth|born)\s*[:#]?\s*[\d/.-]{6,10}\b/gi },
  { kind: 'Phone number', re: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { kind: 'Email address', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { kind: 'Date', re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g },
  { kind: 'Long ID number', re: /\b\d{7,}\b/g },
];

/**
 * Finds details that could identify a patient, so the nurse can double-check
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
