import type { TextLang } from '../review/prompts';

/**
 * Chrome's built-in Language Detector (on this computer): tells French from English far more reliably
 * than counting common words, especially on short or mixed texts. Returns null when Chrome doesn't
 * have it, isn't sure, or the text is in another language; callers then fall back to the word count.
 */

type Detection = { detectedLanguage: string; confidence: number };
interface DetectorApi {
  availability(): Promise<string>;
  create(): Promise<{ detect(text: string): Promise<Detection[]> }>;
}

let detector: Promise<{ detect(text: string): Promise<Detection[]> } | null> | null = null;

function getDetector() {
  detector ??= (async () => {
    const api = (globalThis as { LanguageDetector?: DetectorApi }).LanguageDetector;
    // Only when it's already on this computer: it's small, and Chrome may ask for a click to download it.
    if (!api || (await api.availability().catch(() => 'unavailable')) !== 'available') return null;
    return api.create().catch(() => null);
  })();
  return detector;
}

export async function detectLanguage(text: string, minConfidence = 0.7): Promise<TextLang | null> {
  if (!text.trim()) return null;
  const d = await getDetector();
  const top = (await d?.detect(text).catch(() => []))?.[0];
  if (!top || top.confidence < minConfidence) return null;
  const code = top.detectedLanguage.slice(0, 2);
  return code === 'fr' || code === 'en' ? code : null;
}
