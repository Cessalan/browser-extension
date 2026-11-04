import type { DictateMessage, DictateRequest } from './dictate.worker';

/**
 * Dictation, always on this computer.
 * 1. Chrome's speech recognition, only when it can run on-device (`processLocally`): live text, no download.
 * 2. Otherwise a small Whisper model (French + English) downloaded on the first click, run in a worker.
 * Audio is never saved nor sent anywhere.
 */

export type DictateState =
  | { phase: 'idle' }
  | { phase: 'preparing'; fraction?: number } // mic permission, or model download
  | { phase: 'listening' }
  | { phase: 'transcribing' };

export interface DictateSession {
  stop(): void;
}

interface Handlers {
  lang: 'fr' | 'en';
  onState: (s: DictateState) => void;
  /** A finished piece of text to insert. */
  onText: (text: string) => void;
  onError: (e: Error) => void;
}

// ---- Chrome on-device speech recognition ----

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SRClass = {
  new (): SR;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

const bcp47 = (lang: 'fr' | 'en') => (lang === 'fr' ? 'fr-FR' : 'en-US');

function speechClass(): SRClass | undefined {
  const w = window as unknown as { SpeechRecognition?: SRClass; webkitSpeechRecognition?: SRClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** True only if Chrome can recognise speech without sending audio to a server. */
async function chromeLocal(lang: 'fr' | 'en'): Promise<SRClass | null> {
  const C = speechClass();
  if (!C?.available || !('processLocally' in C.prototype)) return null;
  try {
    const opts = { langs: [bcp47(lang)], processLocally: true };
    const a = await C.available(opts);
    if (a === 'available') return C;
    if ((a === 'downloadable' || a === 'downloading') && C.install && (await C.install(opts))) return C;
  } catch {
    /* fall through to Whisper */
  }
  return null;
}

function startChrome(C: SRClass, h: Handlers): DictateSession {
  const r = new C();
  r.lang = bcp47(h.lang);
  r.continuous = true;
  r.interimResults = false;
  r.processLocally = true; // never the cloud
  let stopped = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal && res[0].transcript.trim()) h.onText(res[0].transcript.trim());
    }
  };
  r.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') h.onError(new Error(e.error));
  };
  r.onend = () => {
    // Chrome stops after a silence; keep listening until the person clicks stop.
    if (!stopped) {
      try { r.start(); return; } catch { /* ended */ }
    }
    h.onState({ phase: 'idle' });
  };
  r.start();
  h.onState({ phase: 'listening' });
  return { stop: () => { stopped = true; r.stop(); } };
}

// ---- Whisper fallback ----

let worker: Worker | null = null;
function getWorker() {
  worker ??= new Worker(new URL('./dictate.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function ask(req: DictateRequest, onProgress?: (f: number) => void): Promise<DictateMessage> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<DictateMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.fraction);
      else if (m.type === 'error') reject(new Error(m.message));
      else resolve(m);
    };
    w.onerror = (e) => reject(new Error(e.message));
    w.postMessage(req, 'audio' in req ? [req.audio.buffer] : []);
  });
}

async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return decoded.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

async function startWhisper(h: Handlers): Promise<DictateSession> {
  // Download (first time only) before listening, so nothing is lost while it loads.
  h.onState({ phase: 'preparing', fraction: 0 });
  await ask({ warmup: true }, (fraction) => h.onState({ phase: 'preparing', fraction }));

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    h.onState({ phase: 'transcribing' });
    try {
      const audio = await toPcm16k(new Blob(chunks, { type: rec.mimeType }));
      const m = await ask({ audio, lang: h.lang });
      if (m.type === 'done' && m.text) h.onText(m.text);
    } catch (e) {
      h.onError(e instanceof Error ? e : new Error(String(e)));
    }
    h.onState({ phase: 'idle' });
  };
  rec.start();
  h.onState({ phase: 'listening' });
  return { stop: () => rec.state !== 'inactive' && rec.stop() };
}

export function dictationSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function startDictation(h: Handlers): Promise<DictateSession> {
  h.onState({ phase: 'preparing' });
  const C = await chromeLocal(h.lang);
  return C ? startChrome(C, h) : startWhisper(h);
}
