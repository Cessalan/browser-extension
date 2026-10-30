import { describe, expect, it } from 'vitest';
import { anonymize, buildProfile, pickExamples, styleInstructions, type StyleExample } from './style';

// Made-up emails.
const ex = (text: string, lang: 'fr' | 'en' = 'fr', at = 1): StyleExample => ({ id: String(Math.random()), text, lang, at });
const a = ex('Bonjour [Nom],\n\nJe vous confirme le transfert jeudi. Pouvez-vous signer le formulaire?\n\nMerci,\nJordan');
const b = ex('Bonjour [Nom],\n\nVous trouverez le rapport ci-joint. Le suivi est prévu lundi.\n\nMerci,\nJordan');
const c = ex('Hi [Name],\n\nThe report is attached. Follow-up is on Monday.\n\nThanks,\nJordan', 'en');

describe('my style', () => {
  it('removes names and numbers before saving', () => {
    expect(anonymize('Dossier 4482913, rappeler au (514) 555-0187.', 'fr')).toBe('Dossier [N° dossier], rappeler au [téléphone].');
    // Names, even before the AI has looked: after a title, or greeted.
    expect(anonymize('Bonjour Mme Gagnon,\nle fils de M. Roy appelle.', 'fr')).toBe('Bonjour [Nom],\nle fils de [Nom] appelle.');
    expect(anonymize('Hi Sarah Lee,\nThanks.', 'en')).toBe('Hi [Name],\nThanks.');
  });

  it('learns greeting, sign-off, vous/tu and sentence length from what the examples share', () => {
    expect(buildProfile([a, b])).toEqual({ greeting: 'Bonjour …,', signoff: 'Merci, Jordan', formality: 'vous', sentences: 'short' });
    expect(buildProfile([a])).toEqual({}); // one example says too little
    // Blank lines between the sign-off lines (separate paragraphs) don't matter.
    expect(buildProfile([ex('Bonjour,\n\nOk.\n\nMerci,\n\nJordan'), ex('Bonjour,\n\nVu.\n\nMerci,\n\nJordan')]).signoff).toBe('Merci, Jordan');
  });

  it('picks the closest examples in the same language, within a budget', () => {
    expect(pickExamples([c, a, b], 'Le rapport pour le suivi de lundi', 'fr', 1)).toEqual([b]);
    expect(pickExamples([c, a, b], 'anything', 'en', 1)).toEqual([c]);
    expect(pickExamples([a, b, c], 'x', 'fr', 3, 20)).toHaveLength(1);
  });

  it('adds nothing when off or empty, and the examples when on', () => {
    expect(styleInstructions({ enabled: false, examples: [a, b] }, 'x', 'fr', 3, 450)).toBe('');
    expect(styleInstructions({ enabled: true, examples: [] }, 'x', 'fr', 3, 450)).toBe('');
    const s = styleInstructions({ enabled: true, examples: [a, b] }, 'transfert jeudi', 'fr', 3, 450);
    expect(s).toContain('Écris comme cette personne');
    expect(s).toContain('salutation habituelle : « Bonjour …, »');
    expect(s).toContain('vouvoie');
    expect(s).toContain('Je vous confirme le transfert jeudi.');
  });
});
