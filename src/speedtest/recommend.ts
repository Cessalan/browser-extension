import type { DeviceInfo } from './device';
import type { AiMode } from './models';

export const MODE_ORDER: AiMode[] = ['fast', 'standard', 'smart'];
const ORDER = MODE_ORDER;
const step = (mode: AiMode, by: number) => ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(mode) + by))];

/**
 * Picks the AI mode for this computer. First from its specs (instant), then, once a
 * speed test has run, from how fast it actually was, since specs alone can mislead.
 */
export function recommendMode(device: DeviceInfo, measured?: { mode: AiMode; tokensPerSecond: number }): AiMode {
  if (measured) {
    const tps = measured.tokensPerSecond;
    if (tps < 6) return step(measured.mode, -1); // too slow to read along: go lighter
    if (tps < 12) return measured.mode === 'smart' ? 'standard' : measured.mode;
    if (tps >= 40) return step(measured.mode, +1); // lots of headroom: a smarter mode will still feel quick
    return measured.mode;
  }

  // Software graphics (no real GPU), older GPUs without 16-bit support, little memory or disk: stay light.
  if (!device.webgpu || isSoftwareGpu(device) || !device.shaderF16) return 'fast';
  if ((device.memoryGB ?? 8) < 8 || (device.storageFreeGB ?? 10) < 2) return 'fast';
  // "Smarter" is only suggested after a speed test proves the computer can handle it.
  return 'standard';
}

/** The browser is drawing graphics on the CPU: WebGPU works, but slowly. */
export function isSoftwareGpu(device: DeviceInfo): boolean {
  return /swiftshader|llvmpipe|software|basic render/i.test(device.gpu ?? '');
}
