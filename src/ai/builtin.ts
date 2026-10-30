/**
 * Chrome's built-in AI (Gemini Nano, through the Prompt API). A much larger model than the ones we
 * download, run by Chrome itself on this computer: nothing leaves the device. Chrome downloads it
 * once (shared by every site), on computers that meet its requirements.
 */

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type Langs = { type: 'text'; languages: string[] }[];
type Options = { expectedInputs: Langs; expectedOutputs: Langs };

export interface BuiltinSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal; responseConstraint?: object }): AsyncIterable<string>;
  destroy(): void;
}

interface LanguageModelApi {
  availability(options: Options): Promise<Availability>;
  create(
    options: Options & {
      initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
      monitor?: (m: EventTarget) => void;
      signal?: AbortSignal;
    },
  ): Promise<BuiltinSession>;
}

const api = () => (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;

const options = (languages: string[]): Options => ({
  expectedInputs: [{ type: 'text', languages }],
  expectedOutputs: [{ type: 'text', languages }],
});

/** English and French if this Chrome supports both; English only on versions without French. */
let chosen: Promise<{ availability: Availability; languages: string[] }> | null = null;

function check() {
  chosen ??= (async () => {
    const LM = api();
    if (!LM) return { availability: 'unavailable' as const, languages: [] };
    for (const languages of [['en', 'fr'], ['en']]) {
      const availability = await LM.availability(options(languages)).catch(() => 'unavailable' as const);
      if (availability !== 'unavailable') return { availability, languages };
    }
    return { availability: 'unavailable' as const, languages: [] };
  })();
  return chosen;
}

/** 'available' (ready), 'downloadable' / 'downloading' (Chrome fetches it on first use), or 'unavailable'. */
export async function builtinAvailability(): Promise<Availability> {
  return (await check()).availability;
}

/** True when Chrome can run its AI on this computer, now or after its one-time download. */
export function builtinUsable(availability: string | null | undefined): boolean {
  return availability === 'available' || availability === 'downloadable' || availability === 'downloading';
}

/**
 * Starts a session. The first call may make Chrome download its model; `onProgress` gets 0..1.
 * Must follow a click or key press the first time (Chrome requires it before downloading).
 */
export async function createBuiltinSession(
  initialPrompts: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<BuiltinSession> {
  const LM = api();
  const { availability, languages } = await check();
  if (!LM || availability === 'unavailable') throw new Error('Chrome built-in AI is not available');
  const session = await LM.create({
    ...options(languages),
    initialPrompts,
    signal,
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.((e as Event & { loaded: number }).loaded)),
  });
  // The model is on this computer now.
  chosen = Promise.resolve({ availability: 'available', languages });
  return session;
}
