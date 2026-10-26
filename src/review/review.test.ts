import { describe, expect, it } from 'vitest';
import { findSensitive } from './sensitive';
import { cleanRewrite, customMessages, parseBullets, reviewMessages, rewriteMessages } from './prompts';

// All example data below is made up.
describe('findSensitive', () => {
  it('flags identifiers', () => {
    const text = 'Pt MRN: 00482913, DOB 03/14/1952, call daughter at (514) 555-0142 or jane.doe@example.com. SSN 123-45-6789. Admit 10/22/2026.';
    expect(findSensitive(text).map((m) => m.kind)).toEqual(['mrn', 'dob', 'phone', 'email', 'ssn', 'date']);
  });

  it('flags French (Quebec) identifiers', () => {
    const text = 'Patiente née le 14/03/1952, NAM TREM 5203 1412, no de dossier 4482913. Date de naissance : 1952-03-14';
    expect(findSensitive(text).map((m) => m.kind)).toEqual(['dob', 'nam', 'mrn', 'dob']);
  });

  it('does not double-count overlapping matches', () => {
    expect(findSensitive('DOB: 03/14/1952').map((m) => m.kind)).toEqual(['dob']);
  });

  it('ignores ordinary text', () => {
    expect(findSensitive('Can you confirm the orders are signed by Friday? Room 12, bed 2.')).toEqual([]);
    expect(findSensitive('Pouvez-vous confirmer que les ordonnances sont signées vendredi?')).toEqual([]);
  });
});

describe('prompts', () => {
  it('asks the model to keep the email language', () => {
    expect(rewriteMessages('shorter', 'Bonjour')[0].content).toContain('same language as the text');
  });

  it('includes the user instruction and the email', () => {
    const [, user] = customMessages('  mets la demande en premier ', 'Bonjour Dr Roy');
    expect(user.content).toBe('Instruction: mets la demande en premier\n\n<text>\nBonjour Dr Roy\n</text>');
  });

  it('answers the check in the UI language', () => {
    expect(reviewMessages('Hi', 'fr')[0].content).toContain('in French');
    expect(reviewMessages('Hi', 'en')[0].content).toContain('in English');
  });
});

describe('parseBullets', () => {
  it('strips bullet markers and blank lines', () => {
    expect(parseBullets('- One\n\n* Two\n• Three\n1. Four')).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

describe('cleanRewrite', () => {
  it('removes preambles and code fences', () => {
    expect(cleanRewrite('Here is the rewritten email:\n\nHi Dr. Lee,\nThanks.')).toBe('Hi Dr. Lee,\nThanks.');
    expect(cleanRewrite('Voici le courriel révisé :\n\nBonjour,')).toBe('Bonjour,');
    expect(cleanRewrite('```\nHi team\n```')).toBe('Hi team');
    expect(cleanRewrite('<text>\nHi team\n</text>')).toBe('Hi team');
  });

  it('keeps normal emails untouched', () => {
    expect(cleanRewrite('Hi Sam,\nHere is the update: all set.')).toBe('Hi Sam,\nHere is the update: all set.');
  });
});
