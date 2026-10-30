import { beforeEach, describe, expect, it, vi } from 'vitest';

// Scripted AI replies: each receives the text to translate (between <text> tags).
const replies: ((text: string) => string)[] = [];
vi.mock('./engine', () => ({
  ai: {
    generate: async (messages: { content: string }[]) => {
      const text = /<text>\n([\s\S]*)\n<\/text>/.exec(String(messages.at(-1)!.content))![1];
      return replies.shift()!(text);
    },
  },
}));

const { translateText } = await import('./translate');
const { UnreliableError } = await import('../review/rewrite');

describe('translateText (with Confi’s own AI)', () => {
  beforeEach(() => {
    replies.length = 0;
    delete (globalThis as { Translator?: unknown }).Translator;
  });

  it('translates line by line, keeps bullets and blank lines, and puts protected details back', async () => {
    replies.push(
      (s) => (expect(s).toBe('Bonjour,'), 'Hello,'),
      (s) => (expect(s).toBe('dossier [X1] prêt'), 'file [X1] ready'),
      (s) => (expect(s).toBe('appeler au [X2]'), 'call [X2]'),
    );
    const out = await translateText('Bonjour,\n\n- dossier 4482913 prêt\n- appeler au (514) 555-0187', 'fr', 'en', () => {});
    expect(out).toBe('Hello,\n\n- file 4482913 ready\n- call (514) 555-0187');
  });

  it('refuses a translation that dropped a protected detail', async () => {
    replies.push(() => 'the file is ready');
    await expect(translateText('le dossier 4482913 est prêt', 'fr', 'en', () => {})).rejects.toBeInstanceOf(UnreliableError);
  });

  it("uses Chrome's translator when the browser has one", async () => {
    (globalThis as { Translator?: unknown }).Translator = {
      availability: async () => 'available',
      create: async () => ({ translate: async (s: string) => s.replace('Merci', 'Thanks') }),
    };
    expect(await translateText('Merci [X9]', 'fr', 'en', () => {})).toBe('Thanks [X9]');
  });
});
