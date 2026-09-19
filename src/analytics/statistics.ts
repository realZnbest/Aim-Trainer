/**
 * Core statistics — pure functions, 100% unit-tested.
 * @module analytics/statistics
 */

/** Mean of values (0 for empty). */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Median (0 for empty). */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Percentile with linear interpolation (p in [0,100]). */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return s[lo] as number;
  const w = rank - lo;
  return (s[lo] as number) * (1 - w) + (s[hi] as number) * w;
}

/** Population standard deviation (0 for <2 samples). */
export function stddev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** z-score of x given population mean/sd. */
export function zScore(x: number, popMean: number, popSd: number): number {
  if (popSd <= 0) return 0;
  return (x - popMean) / popSd;
}

/** Standard normal CDF (Abramowitz-Stegun approx). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export interface Summary {
  count: number;
  mean: number;
  median: number;
  p95: number;
  sd: number;
  min: number;
  max: number;
}

/** Full summary of a sample. */
export function summarize(xs: readonly number[]): Summary {
  if (xs.length === 0) return { count: 0, mean: 0, median: 0, p95: 0, sd: 0, min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return {
    count: xs.length,
    mean: mean(xs),
    median: median(xs),
    p95: percentile(xs, 95),
    sd: stddev(xs),
    min,
    max,
  };
}
