import { describe, expect, it } from 'vitest';
import { AI_MODES, chatOptions, extraBody, fallbackModelId, modeInfo, resolveModelId } from './models';

describe('models', () => {
  it('turns off the sliding window for Gemma 3 only', () => {
    expect(chatOptions('gemma3-1b-it-q4f16_1-MLC')).toEqual({ sliding_window_size: -1 });
    expect(chatOptions('Qwen3-1.7B-q4f16_1-MLC')).toBeUndefined();
  });

  it('uses 32-bit builds when the GPU lacks 16-bit support', () => {
    expect(resolveModelId('gemma3-1b-it-q4f16_1-MLC', false)).toBe('Llama-3.2-1B-Instruct-q4f32_1-MLC');
    expect(fallbackModelId(false)).toContain('q4f32');
    expect(fallbackModelId(true)).toContain('q4f16');
  });

  it('maps every AI mode to a model with a 32-bit fallback', () => {
    for (const { modelId, cpu } of AI_MODES) if (!cpu) expect(resolveModelId(modelId, false)).toContain('q4f32');
    expect(modeInfo('standard').modelId).toContain('gemma3');
  });

  it('turns off Qwen 3 thinking only', () => {
    expect(extraBody('Qwen3-0.6B-q4f16_1-MLC')).toEqual({ enable_thinking: false });
    expect(extraBody('gemma3-1b-it-q4f16_1-MLC')).toBeUndefined();
  });
});
