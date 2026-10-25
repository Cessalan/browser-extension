import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { SPEECH_MODEL } from './models';

export type SttRequest = { audio: Float32Array };
export type SttMessage =
  | { type: 'progress'; fraction: number; text: string }
  | { type: 'done'; loadSeconds: number; transcribeSeconds: number; text: string }
  | { type: 'error'; message: string };

const post = (m: SttMessage) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<SttRequest>) => {
  try {
    const files = new Map<string, { loaded: number; total: number }>();
    const t0 = performance.now();
    // Runs on the CPU so the GPU stays free for the text model.
    const asr = (await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        post({ type: 'progress', fraction: total ? loaded / total : 0, text: `Downloading speech model ${(loaded / 1e6).toFixed(0)} MB` });
      },
    })) as AutomaticSpeechRecognitionPipeline;
    const loadSeconds = (performance.now() - t0) / 1000;

    post({ type: 'progress', fraction: 1, text: 'Transcribing sample…' });
    const t1 = performance.now();
    const out = await asr(e.data.audio);
    const transcribeSeconds = (performance.now() - t1) / 1000;
    await asr.dispose();

    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post({ type: 'done', loadSeconds, transcribeSeconds, text: text.trim() });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
