import { describe, expect, it } from 'vitest';
import { detectLang, translate } from './i18n';

describe('i18n', () => {
  it('picks French for any French browser locale', () => {
    expect(detectLang(['fr-CA', 'en'])).toBe('fr');
    expect(detectLang(['fr'])).toBe('fr');
    expect(detectLang(['en-US', 'fr-CA'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('fills in parameters', () => {
    expect(translate('fr', 'editor.words', { n: 12 })).toBe('12 mots');
    expect(translate('en', 'compare.suggestion', { label: 'Shorter' })).toBe('Suggestion: Shorter');
  });
});
