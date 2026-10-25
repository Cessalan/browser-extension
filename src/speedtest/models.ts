export interface ModelOption {
  id: string;
  label: string;
  downloadMB: number;
}

// Sizes are approximate download sizes for the 4-bit versions.
export const TEXT_MODELS: ModelOption[] = [
  { id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B (recommended)', downloadMB: 700 },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Qwen 3 1.7B (smarter, needs stronger PC)', downloadMB: 1100 },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M (tiny, basic tasks)', downloadMB: 270 },
];

// For GPUs without 16-bit float support, use the 32-bit build (Gemma 3 has none).
const F32_FALLBACK: Record<string, string> = {
  'gemma3-1b-it-q4f16_1-MLC': 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC': 'Qwen3-1.7B-q4f32_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC': 'SmolLM2-360M-Instruct-q4f32_1-MLC',
};

export function resolveModelId(id: string, shaderF16: boolean): string {
  return shaderF16 ? id : (F32_FALLBACK[id] ?? id);
}

export const SPEECH_MODEL = 'onnx-community/moonshine-tiny-ONNX';
