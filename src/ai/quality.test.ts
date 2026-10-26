import { describe, expect, it } from 'vitest';
import { cutRepetition, looksUnrelated } from './quality';

describe('cutRepetition', () => {
  it('cuts a reply that loops on the same sentence', () => {
    const looping = 'The team is working on a project.\nThe team is working on a project.\nThe team is working on a project.\nThe team is working on a project.';
    expect(cutRepetition(looping)).toEqual({ text: 'The team is working on a project.', looped: true });
  });

  it('leaves normal text alone, even with short repeated phrases', () => {
    const fine = 'Hi Dr. Roy,\n\nThe patient is ready. Thank you.\n\n- Orders\n- Orders signed\n\nThank you,\nJordan';
    expect(cutRepetition(fine)).toEqual({ text: fine, looped: false });
  });
});

describe('looksUnrelated', () => {
  const original = 'The new favicon is live in main, but your browser is most likely still showing an old saved copy of the whole app.';

  it('flags a rewrite that ignored the text', () => {
    expect(looksUnrelated(original, 'The team is working on a project.')).toBe(true);
    expect(looksUnrelated(original, '')).toBe(true);
  });

  it('accepts a real rewrite, even a much shorter one', () => {
    expect(looksUnrelated(original, 'The new favicon is live, but your browser still shows an old saved copy.')).toBe(false);
  });

  it('accepts French rewrites with accents changed', () => {
    expect(looksUnrelated('Suivi pour le patient dont on a parlé mardi, il est pret pour le congé vers la réadaptation.', 'Je fais suite à notre discussion de mardi : le patient est prêt pour son congé en réadaptation.')).toBe(false);
  });
});
