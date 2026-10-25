import { describe, expect, it } from 'vitest';
import { countChanges, diffWords } from './diff';

const rebuild = (parts: ReturnType<typeof diffWords>, side: 'before' | 'after') =>
  parts.filter((p) => p.type === 'same' || p.type === (side === 'before' ? 'del' : 'add')).map((p) => p.text).join('');

describe('diffWords', () => {
  it('marks changed words', () => {
    const parts = diffWords('can u confirm orders', 'can you confirm the orders');
    expect(parts.filter((p) => p.type !== 'same').map((p) => [p.type, p.text.trim()])).toEqual([
      ['del', 'u'],
      ['add', 'you'],
      ['add', 'the'],
    ]);
    expect(countChanges(parts)).toEqual({ added: 2, removed: 1 });
  });

  it('rebuilds both texts exactly', () => {
    const before = 'Hi Dr. Patel,\n\nfollowing up on pt.\nthx';
    const after = 'Hi Dr. Patel,\n\nI am following up on the patient.\nThank you,';
    const parts = diffWords(before, after);
    expect(rebuild(parts, 'after')).toBe(after);
    expect(rebuild(parts, 'before').replace(/\s+/g, ' ')).toBe(before.replace(/\s+/g, ' '));
  });

  it('reports no changes for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ type: 'same', text: 'same text' }]);
  });
});
