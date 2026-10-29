import { describe, expect, it } from 'vitest';
import { recommendMode } from './recommend';
import type { DeviceInfo } from './device';

const strong: DeviceInfo = {
  browser: 'Chrome',
  cores: 16,
  memoryGB: 32,
  webgpu: true,
  shaderF16: true,
  gpu: 'amd gcn-5',
  storageFreeGB: 50,
  builtInAI: 'unavailable',
};

describe('recommendMode from specs', () => {
  it("prefers Chrome's built-in AI when Chrome offers it, even without graphics", () => {
    expect(recommendMode({ ...strong, builtInAI: 'available' })).toBe('chrome');
    expect(recommendMode({ ...strong, webgpu: false, builtInAI: 'downloadable' })).toBe('chrome');
  });

  it('picks Standard for a capable computer', () => {
    expect(recommendMode(strong)).toBe('standard');
  });

  it('picks Compatible (CPU) when there is no usable graphics', () => {
    expect(recommendMode({ ...strong, webgpu: false, gpu: null })).toBe('compat');
    expect(recommendMode({ ...strong, gpu: 'google swiftshader' })).toBe('compat');
    expect(recommendMode({ ...strong, gpu: 'microsoft basic render driver' })).toBe('compat');
    expect(recommendMode({ ...strong, webgpu: false }, { mode: 'compat', tokensPerSecond: 3 })).toBe('compat');
  });

  it('picks Faster for older graphics, low memory or low disk', () => {
    expect(recommendMode({ ...strong, shaderF16: false })).toBe('fast');
    expect(recommendMode({ ...strong, memoryGB: 4 })).toBe('fast');
    expect(recommendMode({ ...strong, storageFreeGB: 1 })).toBe('fast');
  });
});

describe('recommendMode after a speed test', () => {
  it('steps down when too slow', () => {
    expect(recommendMode(strong, { mode: 'standard', tokensPerSecond: 3 })).toBe('fast');
    expect(recommendMode(strong, { mode: 'smart', tokensPerSecond: 9 })).toBe('standard');
  });

  it('keeps the mode when it is comfortable', () => {
    expect(recommendMode(strong, { mode: 'standard', tokensPerSecond: 20 })).toBe('standard');
  });

  it('steps up when there is lots of headroom', () => {
    expect(recommendMode(strong, { mode: 'standard', tokensPerSecond: 55 })).toBe('smart');
    expect(recommendMode(strong, { mode: 'smart', tokensPerSecond: 55 })).toBe('smart');
  });
});

describe('recommendMode after graphics resets', () => {
  it('goes lighter, then to the processor', () => {
    expect(recommendMode(strong, undefined, 1)).toBe('fast');
    expect(recommendMode(strong, undefined, 2)).toBe('compat');
    expect(recommendMode(strong, { mode: 'standard', tokensPerSecond: 55 }, 2)).toBe('compat');
  });
});
