import type { SttMessage } from './stt.worker';

// Public-domain speech sample (JFK inaugural address, ~11 s).
const SAMPLE_AUDIO_URL = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';

export interface SttResult {
  audioSeconds: number;
  loadSeconds: number;
  transcribeSeconds: number;
  text: string;
}

export async function runSttTest(onProgress: (fraction: number, text: string) => void): Promise<SttResult> {
  onProgress(0, 'Fetching sample audio…');
  const audio = await loadAudio16k(SAMPLE_AUDIO_URL);
  const audioSeconds = audio.length / 16000; // read before the buffer is transferred to the worker
  const worker = new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' });

  try {
    const { type: _, ...done } = await new Promise<Extract<SttMessage, { type: 'done' }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<SttMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.fraction, m.text);
        else if (m.type === 'done') resolve(m);
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message));
      worker.postMessage({ audio }, [audio.buffer]);
    });
    return { audioSeconds, ...done };
  } finally {
    worker.terminate();
  }
}

async function loadAudio16k(url: string): Promise<Float32Array> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(bytes);
    return decoded.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}
