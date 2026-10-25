import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { useEffect, useState } from 'preact/hooks';
import { TEXT_MODELS, chatOptions, fallbackModelId, resolveModelId } from '../speedtest/models';

export type AiStatus =
  | { state: 'idle'; cached: boolean | null }
  | { state: 'loading'; fraction: number; text: string }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export type Message = ChatCompletionMessageParam;

/**
 * The on-device text model, shared by the whole app. Loaded once per tab, in a Web Worker.
 * The ~700 MB download happens only the first time; after that it loads from the browser cache.
 */
class LocalAI {
  status: AiStatus = { state: 'idle', cached: null };
  private engine: Promise<WebWorkerMLCEngine> | null = null;
  private modelIds: Promise<{ primary: string; fallback: string }> | null = null;
  private listeners = new Set<(s: AiStatus) => void>();

  subscribe(fn: (s: AiStatus) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  protected set(status: AiStatus) {
    this.status = status;
    this.listeners.forEach((fn) => fn(status));
  }

  /** Picks the default model, using the 32-bit build on GPUs without 16-bit support. */
  private getModelIds() {
    this.modelIds ??= (async () => {
      const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('This browser has no WebGPU. Use an up-to-date Chrome or Edge.');
      const f16 = adapter.features.has('shader-f16');
      return { primary: resolveModelId(TEXT_MODELS[0].id, f16), fallback: fallbackModelId(f16) };
    })();
    return this.modelIds;
  }

  async checkCached() {
    if (this.status.state !== 'idle') return;
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      const { primary, fallback } = await this.getModelIds();
      const cached = (await hasModelInCache(primary)) || (await hasModelInCache(fallback));
      if (this.status.state === 'idle') this.set({ state: 'idle', cached });
    } catch {
      if (this.status.state === 'idle') this.set({ state: 'idle', cached: false });
    }
  }

  load(): Promise<WebWorkerMLCEngine> {
    this.engine ??= (async () => {
      this.set({ state: 'loading', fraction: 0, text: 'Starting…' });
      await navigator.storage?.persist?.().catch(() => false);
      const [{ CreateWebWorkerMLCEngine }, { primary, fallback }] = await Promise.all([import('@mlc-ai/web-llm'), this.getModelIds()]);
      const start = async (modelId: string) => {
        const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
        try {
          return await CreateWebWorkerMLCEngine(
            worker,
            modelId,
            { initProgressCallback: (p) => this.set({ state: 'loading', fraction: p.progress, text: p.text }) },
            chatOptions(modelId),
          );
        } catch (err) {
          worker.terminate();
          throw err;
        }
      };
      let engine: WebWorkerMLCEngine;
      try {
        engine = await start(primary);
      } catch (err) {
        if (primary === fallback) throw err;
        console.warn(`${primary} failed to start, falling back to ${fallback}`, err);
        engine = await start(fallback);
      }
      this.set({ state: 'ready' });
      return engine;
    })().catch((err) => {
      this.engine = null;
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
    return this.engine;
  }

  /** Streams a reply. `onText` receives the full text so far. */
  async generate(messages: Message[], onText: (text: string) => void, maxTokens = 1024): Promise<string> {
    const engine = await this.load();
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.3,
    });
    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? '';
      onText(text);
    }
    return text;
  }

  async stop() {
    (await this.engine)?.interruptGenerate();
  }
}

export const ai = new LocalAI();

export function useAiStatus(): AiStatus {
  const [status, setStatus] = useState(ai.status);
  useEffect(() => {
    const unsubscribe = ai.subscribe(setStatus);
    void ai.checkCached();
    return unsubscribe;
  }, []);
  return status;
}

/** Dev only (`npm run dev`, then open `/?mockai`): fake AI for working on the UI without downloading a model. */
class MockAI extends LocalAI {
  async checkCached() {
    this.set({ state: 'ready' });
  }

  load() {
    this.set({ state: 'ready' });
    return Promise.resolve(null as unknown as WebWorkerMLCEngine);
  }

  async generate(messages: Message[], onText: (text: string) => void) {
    const system = String(messages[0].content);
    const user = String(messages.at(-1)?.content ?? '');
    const draft = user.includes('\n\nEmail:\n') ? user.split('\n\nEmail:\n')[1] : user;
    const reply = system.includes('List up to')
      ? system.includes('in French')
        ? '- La date du congé n’est pas précisée.\n- Indiquez qui organise le transport.\n- « eval en physio » peut être flou pour la famille.'
        : '- The date for the discharge is not stated.\n- Say who will arrange transport.\n- "pending the final PT eval" may be unclear to the family.'
      : /[àâéèêçù]/.test(draft)
        ? draft.replace(/\bpt\b/gi, 'patient').replace(/\bpret\b/, 'prêt').replace(/rappelerait/, 'rappellerait').replace(/^merci$/m, 'Merci,')
        : draft.replace(/\bpt\b/gi, 'the patient').replace(/\bu\b/g, 'you').replace(/\br\b/g, 'are').replace(/thx|thanks/i, 'Thank you,');
    await new Promise((r) => setTimeout(r, 1500)); // simulate the model thinking before the first word
    let text = '';
    for (const word of reply.split(/(?<=\s)/)) {
      text += word;
      onText(text);
      await new Promise((r) => setTimeout(r, 15));
    }
    return text;
  }
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('mockai')) {
  Object.setPrototypeOf(ai, MockAI.prototype);
}
