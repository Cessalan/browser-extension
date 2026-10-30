import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { useEffect, useState } from 'preact/hooks';
import {
  CPU_MODE, DEFAULT_MODE, chatOptions, extraBody, fallbackModelId, gpuResetCount, loadSavedMode, modeInfo, noteGpuReset,
  resolveModelId, saveMode, type AiMode,
} from '../speedtest/models';
import { getDeviceInfo } from '../speedtest/device';
import { recommendMode } from '../speedtest/recommend';
import { builtinAvailability, createBuiltinSession } from './builtin';
import type { CpuMessage, CpuRequest } from './cpu.worker';
import { cutRepetition } from './quality';

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
  kind: 'builtin' | 'gpu' | 'cpu';
  /** `schema`: a JSON schema the reply must follow. Only Chrome's AI enforces it; the others just see the prompt. */
  generate(messages: Message[], onText: (text: string) => void, maxTokens: number, schema?: object): Promise<string>;
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
        // Small models can fall into loops; this nudges them away from repeating themselves.
        repetition_penalty: 1.1,
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

/**
 * Chrome's built-in AI. Each request gets a fresh session holding its own instructions and examples,
 * so one request never sees another's text.
 */
async function startBuiltin(onProgress: Progress): Promise<Backend> {
  // Starting a first session makes Chrome download its model if needed (with progress).
  await createBuiltinSession([], (f) => onProgress(f, '')).then((s) => s.destroy());
  let abort = new AbortController();
  const backend: Backend = {
    kind: 'builtin',
    async generate(messages, onText, _maxTokens, schema) {
      abort = new AbortController();
      const signal = abort.signal;
      const turns = messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: String(m.content) }));
      const last = turns.pop()!;
      const session = await createBuiltinSession(turns, undefined, signal);
      let text = '';
      try {
        // Chrome streams new pieces of the reply, not the whole reply so far.
        for await (const piece of session.promptStreaming(last.content, { signal, responseConstraint: schema })) {
          text += piece;
          onText(text);
        }
      } catch (err) {
        if (signal.aborted) return text;
        // An older Chrome without structured replies: ask again without the schema (the prompt still describes the format).
        if (schema && !text) {
          session.destroy();
          return backend.generate(messages, onText, _maxTokens);
        }
        throw err;
      } finally {
        session.destroy();
      }
      return text;
    },
    stop: () => abort.abort(),
    unload: async () => abort.abort(),
  };
  return backend;
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
      // Chrome's built-in AI has no GPU model of its own; Standard is its stand-in if Chrome's AI fails.
      const mode = modeInfo(this.mode).builtin ? DEFAULT_MODE : this.mode;
      return { primary: resolveModelId(modeInfo(mode).modelId, f16), fallback: fallbackModelId(f16) };
    })();
    return this.modelIds;
  }

  async checkCached() {
    if (this.status.state !== 'idle') return;
    let cached = false;
    try {
      const mode = await this.resolveMode();
      if (modeInfo(mode).builtin) {
        cached = (await builtinAvailability()) === 'available';
      } else if (modeInfo(mode).cpu) {
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
      let backend: Backend | null = null;
      if (modeInfo(mode).builtin) {
        backend = await startBuiltin(onProgress).catch((err) => {
          // Chrome's AI can be switched off or missing: fall back to a model we download.
          console.warn("Chrome's built-in AI unavailable, using a downloaded model instead", err);
          return null;
        });
      }
      if (backend) {
        // Chrome's AI is running.
      } else if (modeInfo(mode).cpu) {
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
  /**
   * Streams a reply. `onText` receives the full text so far.
   * If the graphics chip is reset mid-task, steps down to a lighter mode (Faster, then the processor)
   * and retries the same request, so the person gets their answer instead of an error.
   */
  async generate(messages: Message[], onText: (text: string) => void, maxTokens = 1024, schema?: object): Promise<string> {
    for (;;) {
      const backend = await this.load();
      // Loop guard: if the reply starts repeating itself, stop the model and keep the part before the loop.
      let cut: string | null = null;
      const guarded = (text: string) => {
        if (cut !== null) return;
        const checked = cutRepetition(text);
        if (checked.looped) {
          cut = checked.text;
          onText(cut);
          backend.stop();
        } else {
          onText(text);
        }
      };
      try {
        const text = await backend.generate(messages, guarded, maxTokens, schema);
        return cut ?? cutRepetition(text).text;
      } catch (err) {
        if (backend.kind !== 'gpu' || !isGpuLost(err)) throw err;
        // The model on the GPU is gone (its files are still cached). Remember the reset on this computer.
        this.engine = null;
        this.modelIds = null;
        noteGpuReset();
        const lighter: AiMode = this.mode === 'standard' || this.mode === 'smart' ? 'fast' : 'compat';
        if (this.mode === lighter) throw new GpuLostError(err);
        this.switchAfterReset(lighter);
        onText('');
      }
    }
  }

  /** Steps down to a lighter mode after a graphics reset, keeps it for next time, and tells the UI. */
  private switchAfterReset(mode: AiMode) {
    this.mode = mode;
    this.modeResolved = Promise.resolve(mode);
    this.chosen = true;
    saveMode(mode);
    this.set({ state: 'idle', cached: null });
    this.fallbackListeners.forEach((fn) => fn(mode));
  }

  private fallbackListeners = new Set<(mode: AiMode) => void>();

  /** Called when Confi switched to a lighter mode on its own (after a graphics reset). */
  onFallback(fn: (mode: AiMode) => void) {
    this.fallbackListeners.add(fn);
    return () => void this.fallbackListeners.delete(fn);
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
let resetSimulated = false;

async function mockGenerate(messages: Message[], onText: (text: string) => void): Promise<string> {
  // `/?mockai=gpulost`: the first request fails like a graphics-chip reset, to check the automatic recovery.
  if (new URLSearchParams(location.search).get('mockai') === 'gpulost' && !resetSimulated) {
    resetSimulated = true;
    await new Promise((r) => setTimeout(r, 800));
    throw new Error("Failed to execute 'mapAsync' on 'GPUBuffer': A valid external Instance reference no longer exists.");
  }
  // `/?mockai=loop` and `/?mockai=offtopic`: misbehave like a small model, to check the guards.
  const misbehave = new URLSearchParams(location.search).get('mockai');
  if (misbehave === 'loop' || misbehave === 'offtopic') {
    const reply = misbehave === 'loop' ? 'The team is working on a project.\n'.repeat(40) : 'The team is working on a project. We will meet next week to review it.';
    let text = '';
    for (const word of reply.split(/(?<=\s)/)) {
      text += word;
      onText(text);
      await new Promise((r) => setTimeout(r, 5));
    }
    return text;
  }
  const system = String(messages[0].content);
  const user = String(messages.at(-1)?.content ?? '');
  if (system.includes('=>')) {
    // Proofreading: list corrections found in the text, plus one invented one that Confi must reject.
    const known: [string, string][] = [
      ['pouvez vous confirmer', 'pouvez-vous confirmer'],
      ['rappelerait', 'rappellerait'],
      ['we discussed tuesday', 'we discussed on Tuesday'],
      ['orders are signed', 'the orders are signed'],
    ];
    const lines = known.filter(([wrong]) => user.includes(wrong)).map(([w, r]) => `${w} => ${r}`);
    await new Promise((r) => setTimeout(r, 400));
    return lines.length ? [...lines, 'la patiente => le patient'].join('\n') : 'OK';
  }
  const draft = /<text>\n([\s\S]*)\n<\/text>/.exec(user)?.[1] ?? user;
  if (system.includes('identify a specific person')) {
    // Name finder: titled names and street addresses, plus one invented name Confi must reject.
    const details = [
      ...[...user.matchAll(/\b(?:Dre?|Mme|Dr\.)\s+\p{Lu}[\p{L}-]+/gu)].map((m) => ({ text: m[0], kind: 'name' })),
      ...[...user.matchAll(/\d+,? rue [\p{L} -]+?(?=[,.]|$)/gu)].map((m) => ({ text: m[0], kind: 'address' })),
      { text: 'Jean Invented', kind: 'name' },
    ];
    return JSON.stringify({ details });
  }
  if (system.includes('writing assistant')) {
    // Assistant chat: a question if the request mentions a date, otherwise a short note and a new version.
    const request = user.split('</text>').pop()!.trim();
    await new Promise((r) => setTimeout(r, 600));
    if (/date/i.test(request)) return JSON.stringify({ say: /\b(la|le|pour)\b/i.test(request) ? 'Quelle date voulez-vous indiquer?' : 'Which date should I use?', text: '' });
    const fr = /[àâéèêçù]/.test(draft);
    const politer = draft.replace(/^(Bonjour|Hi)([^\n]*)/, fr ? 'Bonjour$2' : 'Hello$2').replace(/\n\n(merci|thx)\b/i, fr ? '\n\nMerci beaucoup et bonne journée,' : '\n\nThank you very much,');
    let text = '';
    // Same shape as Chrome's AI with a JSON schema.
    const reply = JSON.stringify({ say: fr ? 'J’ai rendu le ton plus poli et ajouté une formule de politesse.' : 'I made the tone more polite and added a closing line.', text: politer });
    for (const word of reply.split(/(?<=\s)/)) {
      text += word;
      onText(text);
      await new Promise((r) => setTimeout(r, 10));
    }
    return text;
  }
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

class MockAI extends LocalAI {
  async checkCached() {
    this.set({ state: 'ready' });
  }

  load() {
    this.set({ state: 'ready' });
    return Promise.resolve<Backend>({ kind: 'gpu', generate: mockGenerate, stop() {}, unload: async () => {} });
  }
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('mockai')) {
  Object.setPrototypeOf(ai, MockAI.prototype);
}
