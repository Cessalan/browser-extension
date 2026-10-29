import { describe, expect, it } from 'vitest';
import { chatMessages, splitReply, unlockProposal } from './chat';

// Made-up data.
describe('assistant chat', () => {
  it('sends earlier turns, then the request with the current text, details locked', () => {
    const { messages, locked } = chatMessages(
      [{ role: 'user', content: 'plus poli' }, { role: 'assistant', content: 'J’ai ajouté une formule de politesse.' }],
      'mets la demande en premier',
      'Bonjour, dossier 4482913 prêt. Pouvez-vous signer?',
      'fr',
    );
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(String(messages[0].content)).toContain('(French)');
    expect(messages[3].content).toBe('<text>\nBonjour, dossier [X1] prêt. Pouvez-vous signer?\n</text>\n\nmets la demande en premier');
    expect(locked.get('[X1]')).toBe('4482913');
  });

  it('splits what the assistant says from the proposed text, even mid-stream', () => {
    expect(splitReply('Voulez-vous garder la date?')).toEqual({ say: 'Voulez-vous garder la date?', text: null, writing: false });
    expect(splitReply('J’ai mis la demande en premier.\n<text>\nPouvez-vous')).toEqual({ say: 'J’ai mis la demande en premier.', text: 'Pouvez-vous', writing: true });
    expect(splitReply('Fait.\n<text>\nA\n\nB\n</text>')).toEqual({ say: 'Fait.', text: 'A\n\nB', writing: false });
  });

  it('sets a proposal aside if it lost a protected detail', () => {
    const locked = new Map([['[X1]', '4482913']]);
    expect(unlockProposal('Dossier [X1] prêt.', locked)).toBe('Dossier 4482913 prêt.');
    expect(unlockProposal('Dossier prêt.', locked)).toBeNull();
  });
});
