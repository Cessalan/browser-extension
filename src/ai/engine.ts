import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { useEffect, useState } from 'preact/hooks';
import { TEXT_MODELS, resolveModelId } from '../speedtest/models';

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
  private modelId: Promise<string> | null = null;
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
  private getModelId() {
    this.modelId ??= (async () => {
      const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('This browser has no WebGPU. Use an up-to-date Chrome or Edge.');
      return resolveModelId(TEXT_MODELS[0].id, adapter.features.has('shader-f16'));
    })();
    return this.modelId;
  }

  async checkCached() {
    if (this.status.state !== 'idle') return;
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      const cached = await hasModelInCache(await this.getModelId());
      if (this.status.state === 'idle') this.set({ state: 'idle', cached });
    } catch {
      if (this.status.state === 'idle') this.set({ state: 'idle', cached: false });
    }
  }

  load(): Promise<WebWorkerMLCEngine> {
    this.engine ??= (async () => {
      this.set({ state: 'loading', fraction: 0, text: 'Starting…' });
      await navigator.storage?.persist?.().catch(() => false);
      const [{ CreateWebWorkerMLCEngine }, modelId] = await Promise.all([import('@mlc-ai/web-llm'), this.getModelId()]);
      const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
      const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (p) => this.set({ state: 'loading', fraction: p.progress, text: p.text }),
      });
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
  async generate(messages: Message[], onText: (text: string) => void, maxTokens = 600): Promise<string> {
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
    const draft = String(messages.at(-1)?.content ?? '');
    const reply = String(messages[0].content).includes('List up to')
      ? '- The date for the discharge is not stated.\n- Say who will arrange transport.\n- "pending the final PT eval" may be unclear to the family.'
      : draft.replace(/\bpt\b/gi, 'patient').replace(/thx|thanks/i, 'Thank you');
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
