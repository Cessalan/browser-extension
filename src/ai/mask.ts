import { detailValue, findSensitive } from '../review/sensitive';

/**
 * Locks sensitive details (file numbers, dates of birth, phone numbers…) before the AI sees the text:
 * each one becomes a marker like [X1], which small models copy reliably, and is put back afterwards.
 * The AI therefore can't alter or drop a number without it being noticed.
 */
export function lockDetails(text: string): { text: string; locked: Map<string, string> } {
  // Lock the value itself, not its label: in "dossier 4482913" the AI may still translate or fix "dossier".
  const details = findSensitive(text).map(detailValue);
  // A marker the person typed themselves is locked too, so it isn't mistaken for one the AI invented.
  const typed = [...text.matchAll(/\[\s*x\s*\d+\s*\]/gi)]
    .map((m) => ({ text: m[0], index: m.index }))
    .filter((t) => !details.some((d) => t.index < d.index + d.text.length && d.index < t.index + t.text.length));
  const matches = [...details, ...typed].sort((a, b) => a.index - b.index);
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
  // First drop markers the AI invented, before details (which may look like markers) are put back.
  let out = dropMarkers(text, [...locked.keys()]);
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

/** Removes markers the AI invented (not in `keep`), so a stray "[X1]" never reaches the person. */
export function dropMarkers(text: string, keep: string[] = []): string {
  return text.replace(/( ?)(\[\s*x\s*\d+\s*\])( ?)/gi, (m, before: string, marker: string, after: string) => {
    if (keep.includes(marker.toUpperCase().replace(/\s/g, ''))) return m;
    return before && after ? ' ' : '';
  });
}
