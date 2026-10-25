import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_MODE, chatOptions, extraBody, fallbackModelId, loadSavedMode, modeInfo, resolveModelId, saveMode, type AiMode } from '../speedtest/models';
import { getDeviceInfo } from '../speedtest/device';
import { recommendMode } from '../speedtest/recommend';

export type AiStatus =
  | { state: 'idle'; cached: boolean | null }
  | { state: 'loading'; fraction: number; text: string }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export type Message = ChatCompletionMessageParam;

/**
 * The on-device text model, shared by the whole app. Loaded once per tab, in a Web Worker.
 * The download happens only the first time; after that it loads from the browser cache.
 */
class LocalAI {
  status: AiStatus = { state: 'idle', cached: null };
  /** Faster / Standard / Smarter: the user's saved choice, or else what suits this computer (see resolveMode). */
  mode: AiMode = loadSavedMode() ?? DEFAULT_MODE;
  /** True when the user picked the mode themselves; otherwise Confi picks from the computer's specs. */
  chosen = loadSavedMode() !== null;
  private modeResolved: Promise<AiMode> | null = null;
  private engine: Promise<WebWorkerMLCEngine> | null = null;
  private worker: Worker | null = null;
  private loadedModelId: string | null = null;
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

  /** Switches mode. A model already in memory is unloaded; the new one loads on next use. */
  async setMode(mode: AiMode) {
    this.chosen = true;
    saveMode(mode);
    if (mode === this.mode) return;
    this.mode = mode;
    this.modeResolved = Promise.resolve(mode);
    const engine = this.engine;
    this.engine = null;
    this.modelIds = null;
    this.loadedModelId = null;
    this.set({ state: 'idle', cached: null });
    await (await engine?.catch(() => null))?.unload().catch(() => {});
    void this.checkCached();
  }

  /** The mode to use: the user's choice, or the best fit for this computer's specs. */
  resolveMode(): Promise<AiMode> {
    this.modeResolved ??= this.chosen
      ? Promise.resolve(this.mode)
      : getDeviceInfo()
          .then((device) => (this.mode = recommendMode(device)))
          .catch(() => this.mode);
    return this.modeResolved;
  }

  /** Picks the model for the current mode, using the 32-bit build on GPUs without 16-bit support. */
  private getModelIds() {
    this.modelIds ??= (async () => {
      await this.resolveMode();
      const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('This browser has no WebGPU. Use an up-to-date Chrome or Edge.');
      const f16 = adapter.features.has('shader-f16');
      return { primary: resolveModelId(modeInfo(this.mode).modelId, f16), fallback: fallbackModelId(f16) };
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
          const engine = await CreateWebWorkerMLCEngine(
            worker,
            modelId,
            { initProgressCallback: (p) => this.set({ state: 'loading', fraction: p.progress, text: p.text }) },
            chatOptions(modelId),
          );
          this.worker = worker;
          return engine;
        } catch (err) {
          worker.terminate();
          throw err;
        }
      };
      let engine: WebWorkerMLCEngine;
      try {
        engine = await start(primary);
        this.loadedModelId = primary;
      } catch (err) {
        if (primary === fallback) throw err;
        console.warn(`${primary} failed to start, falling back to ${fallback}`, err);
        engine = await start(fallback);
        this.loadedModelId = fallback;
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

  /** Drops a dead engine so the next use starts a fresh one. */
  private discard() {
    this.engine = null;
    this.loadedModelId = null;
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * Streams a reply. `onText` receives the full text so far.
   * The engine can die under us (GPU reset, computer asleep: "Object has already been disposed"),
   * so a failure restarts it and tries once more before giving up.
   */
  async generate(messages: Message[], onText: (text: string) => void, maxTokens = 1024): Promise<string> {
    try {
      return await this.stream(messages, onText, maxTokens);
    } catch (err) {
      console.warn('AI failed, restarting it and trying again', err);
      this.discard();
      onText('');
      return await this.stream(messages, onText, maxTokens);
    }
  }

  private async stream(messages: Message[], onText: (text: string) => void, maxTokens: number): Promise<string> {
    const engine = await this.load();
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.3,
      extra_body: this.loadedModelId ? extraBody(this.loadedModelId) : undefined,
    });
    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? '';
      onText(text);
    }
    return text;
  }

  async stop() {
    (await this.engine?.catch(() => null))?.interruptGenerate();
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
