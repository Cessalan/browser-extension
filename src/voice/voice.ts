import type { SttMessage } from '../speedtest/stt.worker';
import { decode16k } from '../speedtest/stt';
import type { Lang } from '../i18n';

export type VoiceProgress = (stage: 'download' | 'transcribe', fraction: number) => void;

/**
 * On-device voice typing: Whisper in a Web Worker, kept loaded between dictations.
 * The audio never leaves the computer (the CSP in index.html enforces it).
 */
class Voice {
  private worker: Worker | null = null;

  /** Transcribes 16 kHz mono audio. A crashed worker is restarted and tried once more. */
  async transcribe(audio: Float32Array, lang: Lang, onProgress: VoiceProgress): Promise<string> {
    try {
      return await this.once(audio, lang, onProgress);
    } catch (err) {
      console.warn('Voice typing failed, restarting it and trying again', err);
      this.worker?.terminate();
      this.worker = null;
      return await this.once(audio, lang, onProgress);
    }
  }

  private once(audio: Float32Array, lang: Lang, onProgress: VoiceProgress): Promise<string> {
    const worker = (this.worker ??= new Worker(new URL('../speedtest/stt.worker.ts', import.meta.url), { type: 'module' }));
    return new Promise((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<SttMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.stage, m.fraction);
        else if (m.type === 'done') resolve(m.text);
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message));
      // Not transferred: the retry needs the audio again.
      worker.postMessage({ audio, language: lang === 'fr' ? 'french' : 'english' });
    });
  }
}

export const voice = new Voice();

export type Recording = { stop: () => Promise<Float32Array>; cancel: () => void };

/** Starts the microphone. Rejects with NotAllowedError / NotFoundError when it can't. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => void (e.data.size && chunks.push(e.data));
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          try {
            resolve(await decode16k(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()));
          } catch (err) {
            reject(err);
          }
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
