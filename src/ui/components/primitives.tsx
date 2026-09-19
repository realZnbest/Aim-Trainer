import type { ReactElement, ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Brand mark: range reticle. Drawn geometry (circle + cross ticks), never an
 * emoji or stock icon. Pink ring on transparent; inherits size via props.
 */
export function ReticleMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="16" cy="16" r="11" stroke="#22d3ee" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="2" fill="#22d3ee" />
      <path
        d="M16 1v7M16 24v7M1 16h7M24 16h7"
        stroke="#22d3ee"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'steel';
  className?: string;
  ariaLabel?: string;
}): ReactElement {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-2 font-display text-sm font-semibold tracking-wide transition-colors',
        variant === 'primary' && 'bg-brand text-brand-ink hover:bg-brand-strong',
        variant === 'steel' && 'bg-steel/15 text-steel hover:bg-steel/25',
        variant === 'ghost' && 'border border-line text-ink hover:border-faint hover:bg-raised',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('rounded-card border border-linesoft bg-panel p-5', className)}>
      {children}
    </div>
  );
}

/** Small pill tag — pills are reserved for controls and tags, never cards. */
export function Chip({
  children,
  tone = 'steel',
  className,
}: {
  children: ReactNode;
  tone?: 'steel' | 'pink' | 'mute' | 'green' | 'amber';
  className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider',
        tone === 'steel' && 'bg-steel/12 text-steel',
        tone === 'pink' && 'bg-brand/12 text-brand-soft',
        tone === 'mute' && 'bg-raised text-mist',
        tone === 'green' && 'bg-success/12 text-success',
        tone === 'amber' && 'bg-warn/12 text-warn',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Segmented meter (difficulty / spec bars): filled vs empty ticks, no glow. */
export function Meter({
  value,
  max = 5,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn('h-3 w-1 rounded-sm', i < value ? 'bg-brand' : 'bg-linesoft')}
        />
      ))}
    </span>
  );
}
