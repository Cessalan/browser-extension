import { findSensitive } from '../review/sensitive';

/**
 * Locks sensitive details (file numbers, dates of birth, phone numbers…) before the AI sees the text:
 * each one becomes a marker like [X1], which small models copy reliably, and is put back afterwards.
 * The AI therefore can't alter or drop a number without it being noticed.
 */
export function lockDetails(text: string): { text: string; locked: Map<string, string> } {
  const matches = findSensitive(text);
  const locked = new Map(matches.map((m, i) => [`[X${i + 1}]`, m.text]));
  let out = text;
  // Replace from the end so earlier positions stay valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    out = out.slice(0, m.index) + `[X${i + 1}]` + out.slice(m.index + m.text.length);
  }
  return { text: out, locked };
}

/** Puts the locked details back. `missing` lists markers the AI dropped. */
export function unlockDetails(text: string, locked: Map<string, string>): { text: string; missing: string[] } {
  let out = text;
  const missing: string[] = [];
  for (const [marker, value] of locked) {
    // Small models sometimes add spaces or change case: "[ x1 ]".
    const re = new RegExp(`\\[\\s*${marker.slice(1, -1)}\\s*\\]`, 'gi');
    if (!re.test(out)) missing.push(marker);
    out = out.replace(re, value);
  }
  return { text: out, missing };
}

/** Markers present in a piece of text (to check a paragraph kept the ones it had). */
export function markersIn(text: string): string[] {
  return text.match(/\[X\d+\]/g) ?? [];
}
