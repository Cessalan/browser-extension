/**
 * Guards against the two ways small on-device models go wrong:
 * repeating themselves in a loop, and writing something unrelated to the person's text.
 */

const sentences = /[^.!?\n]+[.!?]?/g;
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Cuts a reply where it starts looping: once the same sentence (3+ words) shows up a third time,
 * everything from its second occurrence on is dropped.
 */
export function cutRepetition(text: string): { text: string; looped: boolean } {
  const seen = new Map<string, { count: number; second: number }>();
  for (const m of text.matchAll(sentences)) {
    const key = normalize(m[0]);
    if (key.split(' ').length < 3) continue;
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { count: 1, second: -1 });
      continue;
    }
    entry.count++;
    if (entry.second < 0) entry.second = m.index;
    if (entry.count >= 3) return { text: text.slice(0, entry.second).trimEnd(), looped: true };
  }
  return { text, looped: false };
}

const contentWords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .match(/\p{L}{4,}/gu) ?? [],
  );

/**
 * True when a rewrite shares almost none of the original's words, i.e. the model ignored the text.
 * Only meant for rewrites in the same language (not translations).
 */
export function looksUnrelated(original: string, suggestion: string): boolean {
  if (!suggestion.trim()) return true;
  const before = contentWords(original);
  if (before.size < 6) return false;
  const after = contentWords(suggestion);
  let shared = 0;
  for (const w of before) if (after.has(w)) shared++;
  return shared / before.size < 0.2;
}

/**
 * Removes a model's "thinking" (Qwen 3 writes <think>…</think> before answering, sometimes empty
 * even with thinking turned off). While it streams, an unclosed <think> hides everything after it.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)\s*/g, '').replace(/^\s*<\/think>\s*/, '');
}
