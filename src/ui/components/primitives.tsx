import type { ReactElement, ReactNode } from 'react';
import { cn } from '../cn';

export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  ariaLabel?: string;
}): ReactElement {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2',
        variant === 'primary' && 'bg-cyan-500 text-black hover:bg-cyan-400',
        variant === 'ghost' && 'border border-white/15 hover:bg-white/10',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-500',
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
    <div className={cn('rounded-lg border border-white/10 bg-panel p-4', className)}>
      {children}
    </div>
  );
}
