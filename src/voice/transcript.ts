/**
 * Pure helpers for voice typing. Whisper invents text on silence ("Thank you.",
 * "Sous-titres réalisés par la communauté d'Amara.org"), so near-silent recordings are
 * dropped before transcription and its non-speech tags are stripped after.
 */

/** True when a 16 kHz recording has no speech worth sending to the model. */
export function isSilent(audio: Float32Array, minSeconds = 0.4, minRms = 0.004): boolean {
  if (audio.length < 16000 * minSeconds) return true;
  let sum = 0;
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / audio.length) < minRms;
}

/** Removes Whisper's sound tags ([Music], (rires)…) and its subtitle-credit hallucinations. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/^.*amara\.org.*$/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text to insert after `before` (the character left of the cursor), spaced like typing. */
export function insertionText(before: string, transcript: string): string {
  const text = cleanTranscript(transcript);
  if (!text) return '';
  return before && !/\s/.test(before) ? ` ${text}` : text;
}
