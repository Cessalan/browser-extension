import type { DeviceInfo } from './device';
import type { LlmResult } from './llm';
import type { SttResult } from './stt';

export type Verdict = 'good' | 'ok' | 'slow';

// Reading speed is ~5 words/s (~7 tokens/s). Faster than that feels instant.
export function llmVerdict(tokensPerSecond: number): Verdict {
  if (tokensPerSecond >= 15) return 'good';
  if (tokensPerSecond >= 6) return 'ok';
  return 'slow';
}

// Real-time factor: seconds of processing per second of audio.
export function sttVerdict(r: Pick<SttResult, 'audioSeconds' | 'transcribeSeconds'>): Verdict {
  const rtf = r.transcribeSeconds / r.audioSeconds;
  if (rtf <= 0.3) return 'good';
  if (rtf <= 1) return 'ok';
  return 'slow';
}

export function formatReport(device: DeviceInfo, llm?: LlmResult, stt?: SttResult): string {
  const lines = [
    'Confi: device speed test',
    `Date: ${new Date().toISOString()}`,
    `Browser: ${device.browser}`,
    `CPU cores: ${device.cores ?? '?'} | RAM: ${device.memoryGB ?? '?'} GB | Free storage: ${device.storageFreeGB ?? '?'} GB`,
    `WebGPU: ${device.webgpu ? 'yes' : 'NO'} | 16-bit: ${device.shaderF16 ? 'yes' : 'no'} | GPU: ${device.gpu ?? '-'}`,
    `Chrome built-in AI: ${device.builtInAI}`,
  ];
  if (llm) {
    lines.push(
      `Text model: ${llm.modelId} (${llm.wasCached ? 'cached' : 'first download'})`,
      `  load ${llm.loadSeconds.toFixed(1)} s | first word ${llm.firstTokenSeconds.toFixed(1)} s | ${llm.tokensPerSecond.toFixed(1)} tokens/s -> ${llmVerdict(llm.tokensPerSecond).toUpperCase()}`,
    );
  }
  if (stt) {
    lines.push(
      `Dictation: ${stt.audioSeconds.toFixed(0)} s audio in ${stt.transcribeSeconds.toFixed(1)} s (load ${stt.loadSeconds.toFixed(1)} s) -> ${sttVerdict(stt).toUpperCase()}`,
    );
  }
  return lines.join('\n');
}
