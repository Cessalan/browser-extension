import { ai } from './engine';
import { builtinAvailability } from './builtin';
import { deviceKind } from '../device';
import { getDeviceInfo } from '../speedtest/device';
import { modeInfo } from '../speedtest/models';

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * Gets the AI ready without asking: the recommended mode starts downloading as soon as Confi opens,
 * so a first request only waits for the rest of the download. Skipped where a big download would
 * hurt: phones, data saver, slow connections, a nearly full disk. Chrome's built-in AI needs a click
 * before Chrome downloads it, so in that mode it starts on the first click or key press instead.
 */
export async function autoLoadAi() {
  if (!window.isSecureContext || ai.status.state === 'loading' || ai.status.state === 'ready') return;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (deviceKind() === 'phone' || connection?.saveData || /(^|-)(2g|3g)$/.test(connection?.effectiveType ?? '')) return;

  const mode = await ai.resolveMode();
  const info = modeInfo(mode);
  if (info.builtin) {
    const availability = await builtinAvailability().catch(() => null);
    if (availability === 'available') void ai.load().catch(() => {});
    else if (availability === 'downloadable' || availability === 'downloading') startOnFirstGesture();
    return;
  }
  const device = await getDeviceInfo().catch(() => null);
  if (device?.storageFreeGB != null && device.storageFreeGB * 1000 < info.downloadMB * 1.5) return;
  void ai.load().catch(() => {});
}

function startOnFirstGesture() {
  const start = () => {
    removeEventListener('pointerdown', start, true);
    removeEventListener('keydown', start, true);
    if (ai.status.state === 'idle') void ai.load().catch(() => {});
  };
  addEventListener('pointerdown', start, true);
  addEventListener('keydown', start, true);
}
