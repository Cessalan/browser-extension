import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { useEffect, useState } from 'preact/hooks';
import {
  CPU_MODE, DEFAULT_MODE, chatOptions, extraBody, fallbackModelId, gpuResetCount, loadSavedMode, modeInfo, noteGpuReset,
  resolveModelId, saveMode, type AiMode,
} from '../speedtest/models';
import { getDeviceInfo } from '../speedtest/device';
import { recommendMode } from '../speedtest/recommend';
import type { CpuMessage, CpuRequest } from './cpu.worker';

export type AiStatus =
  | { state: 'idle'; cached: boolean | null }
  | { state: 'loading'; fraction: number; text: string }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export type Message = ChatCompletionMessageParam;

type Progress = (fraction: number, text: string) => void;

/**
 * The graphics chip was reset mid-task. Windows does this when the GPU is busy for ~2 s (common with
 * integrated graphics on laptops), and the browser loses the AI model that was on it.
 */
export class GpuLostError extends Error {
  constructor(cause: unknown) {
    super('The graphics chip was reset', { cause });
    this.name = 'GpuLostError';
  }
}

const GPU_LOST = /mapAsync|Instance reference no longer exists|device (is |was )?lost|lost.*device|DXGI_ERROR|context lost/i;

function isGpuLost(err: unknown) {
  return GPU_LOST.test(err instanceof Error ? `${err.name} ${err.message}` : String(err));
}

/** What the app needs from a running model, whichever hardware it runs on. */
interface Backend {
  /** Which hardware is doing the work (shown nowhere in the UI; used for decisions and support). */
  kind: 'gpu' | 'cpu';
  generate(messages: Message[], onText: (text: string) => void, maxTokens: number): Promise<string>;
  stop(): void;
  unload(): Promise<void>;
}

/** Graphics card: WebLLM on WebGPU. Tries the mode's model, then a widely compatible fallback. */
async function startGpu(primary: string, fallback: string, onProgress: Progress): Promise<Backend> {
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  const start = async (modelId: string) => {
    const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
    try {
      return await CreateWebWorkerMLCEngine(
        worker,
        modelId,
        { initProgressCallback: (p) => onProgress(p.progress, p.text) },
        chatOptions(modelId),
      );
    } catch (err) {
      worker.terminate();
      throw err;
    }
  };
  let engine: WebWorkerMLCEngine;
  let modelId = primary;
  try {
    engine = await start(primary);
  } catch (err) {
    if (primary === fallback) throw err;
    console.warn(`${primary} failed to start, falling back to ${fallback}`, err);
    engine = await start(fallback);
    modelId = fallback;
  }
  return {
    kind: 'gpu',
    async generate(messages, onText, maxTokens) {
      const stream = await engine.chat.completions.create({
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.3,
        extra_body: extraBody(modelId),
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta?.content ?? '';
        onText(text);
      }
      return text;
    },
    stop: () => engine.interruptGenerate(),
    unload: () => engine.unload(),
  };
}

/** Processor only: transformers.js on WebAssembly, for computers without usable graphics. */
async function startCpu(modelId: string, onProgress: Progress): Promise<Backend> {
  const worker = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
  const send = (m: CpuRequest) => worker.postMessage(m);
  let onMessage: (m: CpuMessage) => void = () => {};
  worker.onmessage = (e: MessageEvent<CpuMessage>) => onMessage(e.data);

  await new Promise<void>((resolve, reject) => {
    onMessage = (m) => {
      if (m.type === 'progress') onProgress(m.fraction, '');
      else if (m.type === 'ready') resolve();
      else if (m.type === 'error') reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message));
    send({ type: 'load', modelId });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  let busy: Promise<unknown> = Promise.resolve();
  return {
    kind: 'cpu',
    generate(messages, onText, maxTokens) {
      // One request at a time: the worker holds a single model.
      const run = busy.then(
        () =>
          new Promise<string>((resolve, reject) => {
            onMessage = (m) => {
              if (m.type === 'text') onText(m.text);
              else if (m.type === 'done') resolve(m.text);
              else if (m.type === 'error') reject(new Error(m.message));
            };
            send({ type: 'generate', messages: messages.map((m) => ({ role: m.role, content: String(m.content) })), maxTokens });
          }),
      );
      busy = run.catch(() => {});
      return run;
    },
    stop: () => send({ type: 'interrupt' }),
    unload: async () => worker.terminate(),
  };
}

/** True if the CPU model's files are already in the browser cache (transformers.js keeps them in Cache Storage). */
async function cpuModelCached(modelId: string) {
  try {
    const cache = await caches.open('transformers-cache');
    return (await cache.keys()).some((r) => r.url.includes(modelId) && r.url.includes('.onnx'));
  } catch {
    return false;
  }
}

/**
 * The on-device text model, shared by the whole app. Loaded once per tab, in a Web Worker.
 * Runs on the graphics card when possible, otherwise on the processor ("Compatible" mode).
 * The download happens only the first time; after that it loads from the browser cache.
 */
class LocalAI {
  status: AiStatus = { state: 'idle', cached: null };
  /** Compatible / Faster / Standard / Smarter: the user's saved choice, or else what suits this computer. */
  mode: AiMode = loadSavedMode() ?? DEFAULT_MODE;
  /** True when the user picked the mode themselves; otherwise Confi picks from the computer's specs. */
  chosen = loadSavedMode() !== null;
  private modeResolved: Promise<AiMode> | null = null;
  private engine: Promise<Backend> | null = null;
  private modelIds: Promise<{ primary: string; fallback: string } | null> | null = null;
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
    this.set({ state: 'idle', cached: null });
    await (await engine?.catch(() => null))?.unload().catch(() => {});
    void this.checkCached();
  }

  /** The mode to use: the user's choice, or the best fit for this computer's specs. */
  resolveMode(): Promise<AiMode> {
    this.modeResolved ??= this.chosen
      ? Promise.resolve(this.mode)
      : getDeviceInfo()
          .then((device) => (this.mode = recommendMode(device, undefined, gpuResetCount())))
          .catch(() => this.mode);
    return this.modeResolved;
  }

  /** GPU model ids for the current mode (32-bit builds on GPUs without 16-bit support), or null without WebGPU. */
  private getGpuModelIds() {
    this.modelIds ??= (async () => {
      const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
      if (!adapter) return null;
      const f16 = adapter.features.has('shader-f16');
      return { primary: resolveModelId(modeInfo(this.mode).modelId, f16), fallback: fallbackModelId(f16) };
    })();
    return this.modelIds;
  }

  async checkCached() {
    if (this.status.state !== 'idle') return;
    let cached = false;
    try {
      const mode = await this.resolveMode();
      if (modeInfo(mode).cpu) {
        cached = await cpuModelCached(CPU_MODE.modelId);
      } else {
        const ids = await this.getGpuModelIds();
        if (ids) {
          const { hasModelInCache } = await import('@mlc-ai/web-llm');
          cached = (await hasModelInCache(ids.primary)) || (await hasModelInCache(ids.fallback));
        }
      }
    } catch {
      cached = false;
    }
    if (this.status.state === 'idle') this.set({ state: 'idle', cached });
  }

  load(): Promise<Backend> {
    this.engine ??= (async () => {
      this.set({ state: 'loading', fraction: 0, text: 'Starting…' });
      await navigator.storage?.persist?.().catch(() => false);
      const onProgress: Progress = (fraction, text) => this.set({ state: 'loading', fraction, text });
      const mode = await this.resolveMode();
      let backend: Backend;
      if (modeInfo(mode).cpu) {
        backend = await startCpu(CPU_MODE.modelId, onProgress);
      } else {
        const ids = await this.getGpuModelIds();
        try {
          if (!ids) throw new Error('No WebGPU');
          backend = await startGpu(ids.primary, ids.fallback, onProgress);
        } catch (err) {
          // Graphics unavailable or failing: the processor still works, just slower.
          console.warn('Graphics AI unavailable, using the processor instead', err);
          backend = await startCpu(CPU_MODE.modelId, onProgress);
        }
      }
      this.set({ state: 'ready' });
      return backend;
    })().catch((err) => {
      this.engine = null;
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
    return this.engine;
  }

  /** Streams a reply. `onText` receives the full text so far. */
  async generate(messages: Message[], onText: (text: string) => void, maxTokens = 1024): Promise<string> {
    const backend = await this.load();
    try {
      return await backend.generate(messages, onText, maxTokens);
    } catch (err) {
      if (backend.kind !== 'gpu' || !isGpuLost(err)) throw err;
      // The model on the GPU is gone. Forget it (its files are still cached, so it can reload), and remember
      // the reset so this computer is steered to a lighter mode.
      this.engine = null;
      this.modelIds = null;
      noteGpuReset();
      this.set({ state: 'idle', cached: true });
      throw new GpuLostError(err);
    }
  }

  async stop() {
    (await this.engine?.catch(() => null))?.stop();
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
    return Promise.resolve(null as unknown as Backend);
  }

  private resetSimulated = false;

  async generate(messages: Message[], onText: (text: string) => void) {
    // `/?mockai=gpulost`: the first request fails like a graphics-chip reset, to check the recovery UI.
    if (new URLSearchParams(location.search).get('mockai') === 'gpulost' && !this.resetSimulated) {
      this.resetSimulated = true;
      await new Promise((r) => setTimeout(r, 800));
      throw new GpuLostError(new Error("Failed to execute 'mapAsync' on 'GPUBuffer'"));
    }
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
