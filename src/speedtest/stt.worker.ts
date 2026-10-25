import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { SPEECH_MODEL } from './models';

export type SttRequest = { audio: Float32Array; language?: 'english' | 'french' };
export type SttMessage =
  | { type: 'progress'; stage: 'download' | 'transcribe'; fraction: number; text: string }
  | { type: 'done'; loadSeconds: number; transcribeSeconds: number; text: string }
  | { type: 'error'; message: string };

const post = (m: SttMessage) => self.postMessage(m);

// Kept between requests so dictating again doesn't reload the model.
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  asr ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    // Runs on the CPU so the GPU stays free for the text model.
    return (await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        post({ type: 'progress', stage: 'download', fraction: total ? loaded / total : 0, text: `Downloading speech model ${(loaded / 1e6).toFixed(0)} MB` });
      },
    })) as AutomaticSpeechRecognitionPipeline;
  })();
  asr.catch(() => (asr = null));
  return asr;
}

self.onmessage = async (e: MessageEvent<SttRequest>) => {
  try {
    const t0 = performance.now();
    const model = await load();
    const loadSeconds = (performance.now() - t0) / 1000;

    post({ type: 'progress', stage: 'transcribe', fraction: 1, text: 'Transcribing…' });
    const t1 = performance.now();
    const out = await model(e.data.audio, {
      language: e.data.language ?? 'english',
      task: 'transcribe',
      // Whisper hears 30 s at a time; longer dictations are cut into overlapping chunks.
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const transcribeSeconds = (performance.now() - t1) / 1000;

    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post({ type: 'done', loadSeconds, transcribeSeconds, text: text.trim() });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
