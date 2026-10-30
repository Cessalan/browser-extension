import { describe, expect, it, vi } from 'vitest';

vi.mock('../ai/engine', () => ({ ai: {} }));
import { verifyNames } from './names';
import { findSensitive, forgetDetail, learnDetails } from '../review/sensitive';
import { lockDetails } from '../ai/mask';

// Made-up data.
const text = 'Bonjour Mme Gagnon, Marc passera au 123 rue Saint-Denis. Le patient est en chambre 412. Marcel aussi.';

describe('names found by the AI', () => {
  it('keeps only real names, addresses and places from the text', () => {
    const raw = JSON.stringify({
      details: [
        { text: 'Mme Gagnon', kind: 'name' },
        { text: 'Marc', kind: 'name' },
        { text: '123 rue Saint-Denis.', kind: 'address' }, // trailing period trimmed
        { text: 'chambre 412', kind: 'place' },
        { text: 'Jean Tremblay', kind: 'name' }, // not in the text
        { text: 'le patient', kind: 'name' }, // a role, no capital
        { text: 'Mme', kind: 'name' }, // a bare title
      ],
    });
    expect(verifyNames(raw, text)).toEqual([
      { text: 'Mme Gagnon', kind: 'name' },
      { text: 'Marc', kind: 'name' },
      { text: '123 rue Saint-Denis', kind: 'address' },
      { text: 'chambre 412', kind: 'place' },
    ]);
    expect(verifyNames('not json', text)).toEqual([]);
  });

  it('protects them everywhere (whole words), locks them for the AI, and can forget one', () => {
    learnDetails([{ text: 'Mme Gagnon', kind: 'name' }, { text: 'Marc', kind: 'name' }]);
    const found = findSensitive(text);
    expect(found.filter((m) => m.learned).map((m) => m.text)).toEqual(['Mme Gagnon', 'Marc']); // not "Marcel"
    expect(lockDetails(text).text).toContain('Bonjour [X1], [X2] passera');
    forgetDetail('Marc');
    learnDetails([{ text: 'Marc', kind: 'name' }]); // the AI finds it again: stays forgotten
    expect(findSensitive(text).filter((m) => m.learned).map((m) => m.text)).toEqual(['Mme Gagnon']);
  });
});
