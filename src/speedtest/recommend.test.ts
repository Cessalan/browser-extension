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
  builtInAI: 'available',
};

describe('recommendMode from specs', () => {
  it('picks Standard for a capable computer', () => {
    expect(recommendMode(strong)).toBe('standard');
  });

  it('picks Faster for weak or software graphics, low memory or low disk', () => {
    expect(recommendMode({ ...strong, gpu: 'google swiftshader' })).toBe('fast');
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
