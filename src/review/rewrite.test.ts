import { beforeEach, describe, expect, it, vi } from 'vitest';

// A scripted AI: each call returns the next reply, given what it was sent.
const replies: ((input: string) => string)[] = [];
const sent: string[] = [];
vi.mock('../ai/engine', () => ({
  ai: {
    generate: async (messages: { content: string }[], onText: (t: string) => void) => {
      const input = /<text>\n([\s\S]*)\n<\/text>/.exec(String(messages.at(-1)!.content))![1];
      sent.push(input);
      const out = replies.shift()!(input);
      onText(out);
      return out;
    },
  },
}));

const { UnreliableError, rewriteText } = await import('./rewrite');

// Made-up data.
const email = 'bonjour dre roy,\n\nle patient né le 14/03/1952 est pret pour son congé vendredi.\n\nla famille demande pour le transport, on va les rappeler au (514) 555-0187.\n\nJordan';

beforeEach(() => {
  replies.length = 0;
  sent.length = 0;
});

describe('rewriteText', () => {
  it('fixes paragraph by paragraph, with details locked and put back', async () => {
    replies.push(
      () => 'Bonjour Dre Roy,',
      (s) => s.replace('pret', 'prêt').replace('le patient', 'Le patient'),
      (s) => s.replace('la famille', 'La famille'),
    );
    const { text, keptAsIs } = await rewriteText({ id: 'fix' }, email, () => {});
    expect(sent[1]).toBe('le patient né le [X1] est pret pour son congé vendredi.'); // the AI never sees the date of birth
    expect(text).toBe('Bonjour Dre Roy,\n\nLe patient né le 14/03/1952 est prêt pour son congé vendredi.\n\nLa famille demande pour le transport, on va les rappeler au (514) 555-0187.\n\nJordan');
    expect(keptAsIs).toBe(0);
  });

  it('keeps a paragraph as it was when the AI drops a detail or goes off-topic', async () => {
    replies.push(
      () => 'Bonjour Dre Roy,',
      () => 'Le patient est prêt pour son congé vendredi.', // dropped [X1]
      () => 'The team is working on a project and will meet next week.', // off-topic
    );
    const { text, keptAsIs } = await rewriteText({ id: 'fix' }, email, () => {});
    expect(keptAsIs).toBe(2);
    expect(text).toContain('le patient né le 14/03/1952 est pret');
    expect(text).toContain('(514) 555-0187');
  });

  it('gives up when nothing usable came back', async () => {
    replies.push(() => '', () => '', () => '');
    await expect(rewriteText({ id: 'professional' }, email, () => {})).rejects.toBeInstanceOf(UnreliableError);
  });

  it('rewrites the whole text for restructuring, and rejects a reply that lost a detail', async () => {
    replies.push((s) => s.replace('[X2]', ''));
    await expect(rewriteText({ id: 'shorter' }, email, () => {})).rejects.toBeInstanceOf(UnreliableError);
    replies.push(() => `Bonjour Dre Roy, le patient né le [X1] part vendredi. Famille à rappeler au [X2].`);
    const { text } = await rewriteText({ id: 'shorter' }, email, () => {});
    expect(text).toBe('Bonjour Dre Roy, le patient né le 14/03/1952 part vendredi. Famille à rappeler au (514) 555-0187.');
  });
});
