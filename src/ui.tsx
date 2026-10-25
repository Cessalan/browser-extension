import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';

export type Progress = { fraction: number; text: string } | null;

export function Card({ title, actions, children }: { title: string; actions?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div class="mb-4 flex items-center gap-2">
        <h3 class="text-[15px] font-semibold tracking-tight">{title}</h3>
        {actions && <div class="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const BUTTON_STYLE = {
  primary: 'bg-brand text-white shadow-button hover:bg-brand-strong',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:border-brand/40 hover:bg-canvas',
  ghost: 'text-muted hover:bg-canvas hover:text-ink',
};

export function Button({
  children,
  onClick,
  disabled,
  title,
  icon: Icon,
  variant = 'primary',
}: {
  children: ComponentChildren;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: keyof typeof BUTTON_STYLE;
}) {
  return (
    <button
      type="button"
      class={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLE[variant]}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ProgressBar({ progress }: { progress: Progress }) {
  if (!progress) return null;
  return (
    <div class="mt-3">
      <div class="h-2 overflow-hidden rounded-full bg-brand-soft">
        <div class="h-full bg-brand transition-all" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
      </div>
      <p class="mt-1 truncate text-xs text-muted">{progress.text}</p>
    </div>
  );
}
