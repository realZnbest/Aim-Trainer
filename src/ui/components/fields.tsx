import type { ReactElement, ReactNode } from 'react';

/** Shared form controls (dark-steel treatment, pink focus). */

export function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-mist">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

export function Num({
  value,
  min,
  max,
  step,
  onChange,
  aria,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  aria: string;
}): ReactElement {
  return (
    <input
      type="number"
      aria-label={aria}
      className="field w-24 text-right font-mono tnum"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Check({
  checked,
  onChange,
  aria,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  aria: string;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? 'flex h-6 w-11 items-center rounded-full bg-brand px-0.5'
          : 'flex h-6 w-11 items-center rounded-full border border-line bg-deep px-0.5'
      }
    >
      <span
        className={
          checked ? 'ml-auto h-5 w-5 rounded-full bg-brand-ink' : 'h-5 w-5 rounded-full bg-faint'
        }
      />
    </button>
  );
}

export function Select({
  value,
  onChange,
  aria,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  aria: string;
  options: readonly string[];
}): ReactElement {
  return (
    <select
      aria-label={aria}
      className="field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
