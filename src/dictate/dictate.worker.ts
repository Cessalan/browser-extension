import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

/** Small Whisper model: understands French and English, runs on this computer (~80 MB, downloaded once). */
export const DICTATION_MODEL = 'onnx-community/whisper-base';

export type DictateRequest = { audio: Float32Array; lang?: 'fr' | 'en' } | { warmup: true };
export type DictateMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'ready' }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

const post = (m: DictateMessage) => self.postMessage(m);
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  if (!asr) {
    const files = new Map<string, { loaded: number; total: number }>();
    asr = pipeline('automatic-speech-recognition', DICTATION_MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        post({ type: 'progress', fraction: total ? loaded / total : 0 });
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    asr.catch(() => { asr = null; });
  }
  return asr;
}

self.onmessage = async (e: MessageEvent<DictateRequest>) => {
  try {
    const model = await load();
    if ('warmup' in e.data) return post({ type: 'ready' });
    const out = await model(e.data.audio, {
      language: e.data.lang === 'fr' ? 'french' : e.data.lang === 'en' ? 'english' : undefined,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post({ type: 'done', text: text.trim() });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
