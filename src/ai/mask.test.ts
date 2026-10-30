import { describe, expect, it } from 'vitest';
import { dropMarkers, lockDetails, markersIn, unlockDetails } from './mask';

// Made-up data.
const text = 'Patient né le 14/03/1952, dossier 4482913. Rappeler la fille au (514) 555-0187.';

describe('lockDetails / unlockDetails', () => {
  it('replaces details (not their labels) with markers and puts them back', () => {
    const { text: locked, locked: map } = lockDetails(text);
    expect(locked).toBe('Patient né le [X1], dossier [X2]. Rappeler la fille au [X3].');
    expect(markersIn(locked)).toEqual(['[X1]', '[X2]', '[X3]']);
    const rewritten = 'Le patient (né le [X1], dossier [X2]) est prêt. Merci de rappeler sa fille au [ x3 ].';
    expect(unlockDetails(rewritten, map)).toEqual({
      text: 'Le patient (né le 14/03/1952, dossier 4482913) est prêt. Merci de rappeler sa fille au (514) 555-0187.',
      missing: [],
    });
  });

  it('reports a marker the AI dropped', () => {
    const { locked } = lockDetails(text);
    expect(unlockDetails('Le patient [X1] est prêt.', locked).missing).toEqual(['[X2]', '[X3]']);
  });

  it('leaves text without details alone', () => {
    expect(lockDetails('Bonjour, merci.')).toEqual({ text: 'Bonjour, merci.', locked: new Map() });
  });

  it('drops markers the AI invented', () => {
    expect(unlockDetails('Le rapport prend [X1] 7 jours.', new Map()).text).toBe('Le rapport prend 7 jours.');
    expect(unlockDetails('[X2] Merci [x 3].', new Map()).text).toBe('Merci.');
    expect(dropMarkers('Dossier [X1] et [X2].', ['[X1]'])).toBe('Dossier [X1] et.');
  });

  it('keeps a marker the person typed themselves', () => {
    const { text: locked, locked: details } = lockDetails('Voir la note [X9].');
    expect(locked).toBe('Voir la note [X1].');
    expect(unlockDetails('See note [X1].', details).text).toBe('See note [X9].');
  });
});
