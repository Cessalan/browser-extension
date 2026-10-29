import type { DeviceInfo } from './device';
import { BUILTIN_MODE, CPU_MODE, DEFAULT_MODE, GPU_MODES, type AiMode } from './models';
import { builtinUsable } from '../ai/builtin';

/** GPU modes, lightest first. "compat" (CPU) sits outside this ladder: it's for computers without usable graphics. */
export const MODE_ORDER: AiMode[] = ['fast', 'standard', 'smart'];
const ORDER = MODE_ORDER;
const step = (mode: AiMode, by: number) => ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(mode) + by))];

/**
 * Picks the AI mode for this computer. First from its specs (instant), then, once a
 * speed test has run, from how fast it actually was, since specs alone can mislead.
 */
export function recommendMode(device: DeviceInfo, measured?: { mode: AiMode; tokensPerSecond: number }, gpuResets = 0): AiMode {
  // Chrome's built-in AI writes far better than the small models we can download, so use it when Chrome offers it.
  if (builtinUsable(device.builtInAI)) return 'chrome';
  // No usable graphics (none, software-only, or the page can't use it): the CPU mode is the only one that runs.
  if (!device.webgpu || isSoftwareGpu(device)) return 'compat';
  // The graphics chip was reset under AI load on this computer: go lighter, then off the GPU entirely.
  if (gpuResets >= 2) return 'compat';
  if (gpuResets === 1) return 'fast';

  if (measured && ORDER.includes(measured.mode)) {
    const tps = measured.tokensPerSecond;
    if (tps < 6) return step(measured.mode, -1); // too slow to read along: go lighter
    if (tps < 12) return measured.mode === 'smart' ? 'standard' : measured.mode;
    if (tps >= 40) return step(measured.mode, +1); // lots of headroom: a smarter mode will still feel quick
    return measured.mode;
  }

  // Older GPUs without 16-bit support, little memory or disk: stay light.
  if (!device.shaderF16) return 'fast';
  if ((device.memoryGB ?? 8) < 8 || (device.storageFreeGB ?? 10) < 2) return 'fast';
  // "Smarter" is only suggested after a speed test proves the computer can handle it.
  return 'standard';
}

/** The browser is drawing graphics on the CPU: WebGPU works, but slowly. */
export function isSoftwareGpu(device: DeviceInfo): boolean {
  return /swiftshader|llvmpipe|software|basic render/i.test(device.gpu ?? '');
}

/** The modes this computer can run, in the order shown: Chrome's AI if offered, then GPU modes or Compatible. */
export function modesFor(device: DeviceInfo | null) {
  const usableGpu = !!device?.webgpu && !isSoftwareGpu(device);
  return [...(builtinUsable(device?.builtInAI) ? [BUILTIN_MODE] : []), ...(usableGpu ? GPU_MODES : [CPU_MODE])];
}

/** The mode to highlight: the current one if this computer can run it, else the closest that it can. */
export function shownModeFor(device: DeviceInfo | null, mode: AiMode): AiMode {
  if (modesFor(device).some((m) => m.mode === mode)) return mode;
  return device?.webgpu && !isSoftwareGpu(device) ? DEFAULT_MODE : 'compat';
}
