import { builtinAvailability } from '../ai/builtin';

export interface DeviceInfo {
  browser: string;
  cores: number | null;
  memoryGB: number | null;
  webgpu: boolean;
  shaderF16: boolean;
  gpu: string | null;
  storageFreeGB: number | null;
  builtInAI: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const info: DeviceInfo = {
    browser: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null,
    webgpu: false,
    shaderF16: false,
    gpu: null,
    storageFreeGB: null,
    builtInAI: 'not available',
  };

  if (navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (adapter) {
      info.webgpu = true;
      info.shaderF16 = adapter.features.has('shader-f16');
      const a = adapter.info;
      info.gpu = [a.vendor, a.architecture, a.description].filter(Boolean).join(' ') || 'unknown';
    }
  }

  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est?.quota != null) {
    info.storageFreeGB = round((est.quota - (est.usage ?? 0)) / 1e9, 1);
  }

  // Chrome's on-device Gemini Nano (Prompt API). Only recent Chrome versions expose it to websites.
  if ('LanguageModel' in globalThis) info.builtInAI = await builtinAvailability().catch(() => 'error');

  return info;
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
