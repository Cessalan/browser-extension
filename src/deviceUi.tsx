import { Info, Laptop, Smartphone, Tablet } from 'lucide-preact';
import { useI18n } from './i18n';
import { browserName, deviceKind, deviceLabel } from './device';
import { builtinUsable } from './ai/builtin';

const ICONS = { phone: Smartphone, tablet: Tablet, computer: Laptop };

/** "iPhone · Safari" with the matching icon, first in the device check. */
export function DeviceBadge() {
  const Icon = ICONS[deviceKind()];
  return (
    <li class="inline-flex items-center gap-2 font-medium text-ink">
      <Icon size={16} class="text-brand" aria-hidden="true" />
      {deviceLabel() || '—'}
    </li>
  );
}

/**
 * Advice that fits the situation: on a phone, the AI is lighter; on a computer without Chrome's AI,
 * Chrome would do better. Nothing when the best option is already in use.
 */
export function DeviceNote({ builtInAI }: { builtInAI: string | undefined }) {
  const { t } = useI18n();
  const kind = deviceKind();
  const note = builtinUsable(builtInAI)
    ? null // Chrome's AI is here: already the best option
    : kind !== 'computer'
      ? t('device.note.mobile')
      : browserName() !== 'Chrome'
        ? t('device.note.useChrome')
        : null;
  if (!note) return null;
  return (
    <p class="mt-3 flex gap-2 rounded-lg bg-canvas px-3 py-2 text-sm text-ink/80">
      <Info size={16} class="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      {note}
    </p>
  );
}
