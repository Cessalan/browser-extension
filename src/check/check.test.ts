import { describe, expect, it } from 'vitest';
import { findShorthand } from './shorthand';
import { findBasics } from './rules';
import { parseEdits, verifyEdits } from './aiEdits';
import { mergeIssues } from './types';

const fixes = (issues: { text: string; suggestions: string[] }[]) => issues.map((i) => `${i.text}→${i.suggestions[0]}`);

describe('shorthand', () => {
  it('expands shorthand in both languages, keeping capitals and skipping acronyms', () => {
    expect(fixes(findShorthand("suivi pour le pt, l'eval est ok. Rdv jeudi svp", 'fr'))).toEqual([
      'pt→patient', 'eval→évaluation', 'Rdv→Rendez-vous', 'svp→s’il vous plaît',
    ]);
    expect(fixes(findShorthand('can u confirm? final PT eval w/ dr. Lee, thx', 'en'))).toEqual([
      'u→you', 'eval→evaluation', 'w/→with', 'dr→Dr', 'thx→thanks',
    ]);
  });
});

describe('basic rules', () => {
  it('finds repeated words, double spaces, stray spaces and French sentence starts', () => {
    expect(fixes(findBasics('le le dossier  est prêt . merci', 'fr'))).toEqual(['le le→le', '  → ', ' →', 'le→Le', 'merci→Merci']);
    expect(fixes(findBasics('nous nous verrons', 'fr'))).toEqual(['nous→Nous']);
    expect(fixes(findBasics('the the file is ready', 'en'))).toEqual(['the the→the', 'the→The']);
  });
});

describe('AI corrections', () => {
  const paragraph = "pouvez vous confirmé que les ordonnances sont signées? dossier 4482913, il est pret.";

  it('parses the reply and keeps only small corrections that are really in the text', () => {
    const edits = parseEdits(
      [
        '- pouvez vous => pouvez-vous',
        '"confirmé" → "confirmer"',
        'il est pret => il est prêt',
        'dossier 4482913 => dossier 4482914', // touches a protected detail
        'les ordonnances sont signées => toutes les prescriptions ont été validées par le médecin', // a rewrite
        'le patient => la patiente', // not in the text
        'OK',
      ].join('\n'),
    );
    expect(edits).toHaveLength(6);
    const issues = mergeIssues([verifyEdits(paragraph, edits)], [{ start: 55, end: 70 }]);
    expect(fixes(issues)).toEqual(['pouvez vous→pouvez-vous', 'confirmé→confirmer', 'il est pret→il est prêt']);
    expect(issues.every((i) => paragraph.slice(i.start, i.end) === i.text)).toBe(true);
  });

  it('does not suggest a correction that is already made', () => {
    expect(verifyEdits('confirm the orders are signed', parseEdits('orders are signed => the orders are signed'))).toEqual([]);
  });

  it('gives a correction at a sentence start its capital', () => {
    expect(fixes(mergeIssues([findShorthand('pt est prêt', 'fr'), findBasics('pt est prêt', 'fr')]))).toEqual(['pt→Patient']);
  });

  it('still applies a correction once its first word got a capital', () => {
    expect(fixes(verifyEdits('Pouvez vous confirmer?', parseEdits('pouvez vous => pouvez-vous')))).toEqual(['Pouvez vous→Pouvez-vous']);
  });

  it('ignores markers and partial-word matches', () => {
    expect(verifyEdits('le [X1] est la', parseEdits('[X1] => [X2]'))).toEqual([]);
    expect(verifyEdits('important', parseEdits('port => porte'))).toEqual([]);
  });
});
