import { useEffect, useState } from 'preact/hooks';
import { MAX_EXAMPLES, anonymize, type StyleData, type StyleExample } from './style';
import { detectTextLang } from '../review/prompts';

/**
 * Where "My style" lives: IndexedDB in this browser, on this device. Only confi.ca can read it;
 * nothing is sent anywhere. Loaded once at start, kept in memory, written back on every change.
 */

const DB = 'confi';
const STORE = 'kv';
const KEY = 'style';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<StyleData | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as StyleData | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function write(data: StyleData) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let data: StyleData = { enabled: false, examples: [] };
const listeners = new Set<(d: StyleData) => void>();

function update(next: StyleData) {
  data = next;
  listeners.forEach((fn) => fn(data));
  // Storage blocked (private window, policy): the style still works until the tab closes.
  void write(data).catch(() => {});
}

if (typeof indexedDB !== 'undefined') {
  void read()
    .then((saved) => saved && update({ enabled: !!saved.enabled, examples: saved.examples ?? [] }))
    .catch(() => {});
}

/** The current style data (for prompts). */
export const getStyle = () => data;

export const style = {
  setEnabled: (enabled: boolean) => update({ ...data, enabled }),
  /** Saves an email as an example, anonymized. Returns false if it's too short to say much. */
  add(text: string): boolean {
    const clean = text.trim();
    if (clean.split(/\s+/).length < 8) return false;
    const lang = detectTextLang(clean);
    const example: StyleExample = { id: crypto.randomUUID(), text: anonymize(clean, lang), lang, at: Date.now() };
    if (data.examples.some((e) => e.text === example.text)) return true;
    // Full: the oldest one makes room.
    update({ ...data, enabled: true, examples: [...data.examples, example].slice(-MAX_EXAMPLES) });
    return true;
  },
  remove: (id: string) => update({ ...data, examples: data.examples.filter((e) => e.id !== id) }),
  clear: () => update({ enabled: data.enabled, examples: [] }),
};

export function useStyle(): StyleData {
  const [d, set] = useState(data);
  useEffect(() => {
    listeners.add(set);
    set(data);
    return () => void listeners.delete(set);
  }, []);
  return d;
}
