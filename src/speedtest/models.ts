/**
 * What people choose between. They see "Faster / Standard / Smarter" (or "Compatible"), never model names.
 * Sizes are approximate one-time downloads.
 * GPU modes run on WebLLM (WebGPU). "Compatible" runs on the CPU (transformers.js / WebAssembly) for
 * computers without usable graphics: no GPU, virtual desktops, graphics acceleration turned off.
 */
export type AiMode = 'compat' | 'fast' | 'standard' | 'smart';

export const AI_MODES: { mode: AiMode; modelId: string; downloadMB: number; cpu?: true }[] = [
  { mode: 'compat', modelId: 'onnx-community/Qwen2.5-0.5B-Instruct', downloadMB: 500, cpu: true },
  { mode: 'fast', modelId: 'Qwen3-0.6B-q4f16_1-MLC', downloadMB: 400 },
  { mode: 'standard', modelId: 'gemma3-1b-it-q4f16_1-MLC', downloadMB: 700 },
  { mode: 'smart', modelId: 'Qwen3-1.7B-q4f16_1-MLC', downloadMB: 1100 },
];

export const GPU_MODES = AI_MODES.filter((m) => !m.cpu);
export const CPU_MODE = AI_MODES.find((m) => m.cpu)!;

export const DEFAULT_MODE: AiMode = 'standard';

export function modeInfo(mode: AiMode) {
  return AI_MODES.find((m) => m.mode === mode) ?? AI_MODES.find((m) => m.mode === DEFAULT_MODE)!;
}

const MODE_KEY = 'aiMode';

/** The mode the user picked on this computer, or null if they never chose (Confi then picks for them). */
export function loadSavedMode(): AiMode | null {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (AI_MODES.some((m) => m.mode === saved)) return saved as AiMode;
  } catch {
    // Storage blocked: treat as not chosen.
  }
  return null;
}

const GPU_RESETS_KEY = 'gpuResets';

/** How many times the graphics chip was reset while running the AI on this computer (a count, nothing else). */
export function gpuResetCount(): number {
  try {
    return Number(localStorage.getItem(GPU_RESETS_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function noteGpuReset() {
  try {
    localStorage.setItem(GPU_RESETS_KEY, String(gpuResetCount() + 1));
  } catch {
    // Not critical: we just won't remember it.
  }
}

export function saveMode(mode: AiMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not critical: the choice just won't be remembered.
  }
}

// For GPUs without 16-bit float support, use the 32-bit build (Gemma 3 has none).
const F32_FALLBACK: Record<string, string> = {
  'gemma3-1b-it-q4f16_1-MLC': 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
  'Qwen3-0.6B-q4f16_1-MLC': 'Qwen3-0.6B-q4f32_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC': 'Qwen3-1.7B-q4f32_1-MLC',
};

export function resolveModelId(id: string, shaderF16: boolean): string {
  return shaderF16 ? id : (F32_FALLBACK[id] ?? id);
}

/** Used automatically if the chosen model fails to start. */
export function fallbackModelId(shaderF16: boolean): string {
  return shaderF16 ? 'Llama-3.2-1B-Instruct-q4f16_1-MLC' : 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
}

/**
 * Per-model runtime settings. Gemma 3's published config sets both a context window and a
 * sliding window, which WebLLM rejects ("Only one of context_window_size and
 * sliding_window_size can be positive"), so turn the sliding window off.
 */
export function chatOptions(modelId: string): { sliding_window_size?: number } | undefined {
  return modelId.startsWith('gemma3') ? { sliding_window_size: -1 } : undefined;
}

/** Qwen 3 "thinks out loud" by default; turn that off so answers start right away. */
export function extraBody(modelId: string): { enable_thinking: false } | undefined {
  return modelId.startsWith('Qwen3') ? { enable_thinking: false } : undefined;
}

export const SPEECH_MODEL = 'onnx-community/moonshine-tiny-ONNX';
