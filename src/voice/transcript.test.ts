import { describe, expect, it } from 'vitest';
import { cleanTranscript, insertionText, isSilent } from './transcript';

describe('isSilent', () => {
  it('drops recordings that are too short or too quiet', () => {
    expect(isSilent(new Float32Array(1000).fill(0.2))).toBe(true);
    expect(isSilent(new Float32Array(16000).fill(0.0005))).toBe(true);
  });

  it('keeps a recording with speech-level sound', () => {
    const audio = Float32Array.from({ length: 16000 }, (_, i) => 0.1 * Math.sin(i / 10));
    expect(isSilent(audio)).toBe(false);
  });
});

describe('cleanTranscript', () => {
  it('strips sound tags and subtitle credits', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] Bonjour (rires) docteur ')).toBe('Bonjour docteur');
    expect(cleanTranscript("Sous-titres réalisés par la communauté d'Amara.org")).toBe('');
  });
});

describe('insertionText', () => {
  it('adds a space after a word but not after a space or at the start', () => {
    expect(insertionText('k', 'Merci.')).toBe(' Merci.');
    expect(insertionText(' ', 'Merci.')).toBe('Merci.');
    expect(insertionText('', 'Merci.')).toBe('Merci.');
  });

  it('inserts nothing when nothing was said', () => {
    expect(insertionText('k', '[Music]')).toBe('');
  });
});
