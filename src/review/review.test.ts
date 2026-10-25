import { describe, expect, it } from 'vitest';
import { findSensitive } from './sensitive';
import { cleanRewrite, parseBullets } from './prompts';

// All example data below is made up.
describe('findSensitive', () => {
  it('flags identifiers', () => {
    const text = 'Pt MRN: 00482913, DOB 03/14/1952, call daughter at (514) 555-0142 or jane.doe@example.com. SSN 123-45-6789. Admit 10/22/2026.';
    expect(findSensitive(text).map((m) => m.kind)).toEqual([
      'Medical record number',
      'Date of birth',
      'Phone number',
      'Email address',
      'SSN',
      'Date',
    ]);
  });

  it('does not double-count overlapping matches', () => {
    const kinds = findSensitive('DOB: 03/14/1952').map((m) => m.kind);
    expect(kinds).toEqual(['Date of birth']);
  });

  it('ignores ordinary text', () => {
    expect(findSensitive('Can you confirm the orders are signed by Friday? Room 12, bed 2.')).toEqual([]);
  });
});

describe('parseBullets', () => {
  it('strips bullet markers and blank lines', () => {
    expect(parseBullets('- One\n\n* Two\n• Three\n1. Four')).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

describe('cleanRewrite', () => {
  it('removes preambles and code fences', () => {
    expect(cleanRewrite("Here is the rewritten email:\n\nHi Dr. Lee,\nThanks.")).toBe('Hi Dr. Lee,\nThanks.');
    expect(cleanRewrite('```\nHi team\n```')).toBe('Hi team');
  });

  it('keeps normal emails untouched', () => {
    expect(cleanRewrite('Hi Sam,\nHere is the update: all set.')).toBe('Hi Sam,\nHere is the update: all set.');
  });
});
