import {
  InterruptableStoppingCriteria,
  TextStreamer,
  pipeline,
  type TextGenerationPipeline,
} from '@huggingface/transformers';

/**
 * "Compatible" mode: runs a small text model on the CPU (WebAssembly) for computers without
 * usable graphics (no GPU, virtual desktops, graphics acceleration turned off).
 * Uses several CPU cores when the page is cross-origin isolated (see src/sw.ts), one otherwise.
 */

export type CpuRequest =
  | { type: 'load'; modelId: string }
  | { type: 'generate'; messages: { role: string; content: string }[]; maxTokens: number }
  | { type: 'interrupt' };

export type CpuMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'ready' }
  | { type: 'text'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

const post = (m: CpuMessage) => self.postMessage(m);
let generator: TextGenerationPipeline | null = null;
const stopping = new InterruptableStoppingCriteria();

async function load(modelId: string) {
  const files = new Map<string, { loaded: number; total: number }>();
  generator = (await pipeline('text-generation', modelId, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', fraction: total ? loaded / total : 0 });
    },
  })) as TextGenerationPipeline;
  post({ type: 'ready' });
}

async function generate(messages: { role: string; content: string }[], maxTokens: number) {
  if (!generator) throw new Error('Model not loaded');
  stopping.reset();
  let text = '';
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece: string) => {
      text += piece;
      post({ type: 'text', text });
    },
  });
  // repetition_penalty: small models can fall into loops; this nudges them away from repeating themselves.
  await generator(messages, { max_new_tokens: maxTokens, do_sample: false, repetition_penalty: 1.15, streamer, stopping_criteria: stopping });
  post({ type: 'done', text });
}

self.onmessage = async (e: MessageEvent<CpuRequest>) => {
  try {
    if (e.data.type === 'load') await load(e.data.modelId);
    else if (e.data.type === 'generate') await generate(e.data.messages, e.data.maxTokens);
    else stopping.interrupt();
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
