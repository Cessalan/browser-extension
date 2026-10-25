import { describe, expect, it } from 'vitest';
import { formatReport, llmVerdict, sttVerdict } from './report';
import type { DeviceInfo } from './device';

const device: DeviceInfo = {
  browser: 'TestBrowser',
  cores: 8,
  memoryGB: 8,
  webgpu: true,
  shaderF16: false,
  gpu: 'intel gen-12',
  storageFreeGB: 50,
  builtInAI: 'not available',
};

describe('verdicts', () => {
  it('rates text model speed', () => {
    expect(llmVerdict(30)).toBe('good');
    expect(llmVerdict(8)).toBe('ok');
    expect(llmVerdict(2)).toBe('slow');
  });

  it('rates dictation by real-time factor', () => {
    expect(sttVerdict({ audioSeconds: 10, transcribeSeconds: 1 })).toBe('good');
    expect(sttVerdict({ audioSeconds: 10, transcribeSeconds: 8 })).toBe('ok');
    expect(sttVerdict({ audioSeconds: 10, transcribeSeconds: 20 })).toBe('slow');
  });
});

describe('formatReport', () => {
  it('includes device info and results', () => {
    const text = formatReport(
      device,
      { modelId: 'm', wasCached: false, loadSeconds: 60, firstTokenSeconds: 0.5, tokensPerSecond: 20, totalSeconds: 8, output: '' },
      { audioSeconds: 11, loadSeconds: 3, transcribeSeconds: 1.2, text: '' },
    );
    expect(text).toContain('WebGPU: yes | 16-bit: no');
    expect(text).toContain('first download');
    expect(text).toContain('20.0 tokens/s -> GOOD');
    expect(text).toContain('11 s audio in 1.2 s');
  });

  it('works before any test has run', () => {
    expect(formatReport(device)).not.toContain('Text model');
  });
});
