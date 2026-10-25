export type DiffPart = { type: 'same' | 'add' | 'del'; text: string };

/** Word-level diff (longest common subsequence). Whitespace is kept attached to tokens so text round-trips. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const key = (t: string) => t.trim();

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts.at(-1);
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      push('same', b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('del', a[i++]);
    } else {
      push('add', b[j++]);
    }
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('add', b[j++]);
  return parts;
}

/** Splits into words, each carrying its trailing whitespace. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function countChanges(parts: DiffPart[]): { added: number; removed: number } {
  const words = (p: DiffPart) => p.text.trim().split(/\s+/).filter(Boolean).length;
  return {
    added: parts.filter((p) => p.type === 'add').reduce((n, p) => n + words(p), 0),
    removed: parts.filter((p) => p.type === 'del').reduce((n, p) => n + words(p), 0),
  };
}
