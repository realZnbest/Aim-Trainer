import { describe, expect, it } from 'vitest';
import { aggregateFlicks, analyzeFlick } from '@/analytics/flick';
import type { CrosshairPathPoint } from '@/engine/types';

function line(n: number, from: number, to: number): CrosshairPathPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    tMs: i * 8,
    yawRad: from + ((to - from) * i) / (n - 1),
    pitchRad: 0,
  }));
}

describe('flick analysis', () => {
  it('clean flick: no overshoot, no corrections', () => {
    const path = line(10, 0, 0.1);
    const v = analyzeFlick({
      idealDeg: (0.1 * 180) / Math.PI,
      path,
      targetYaw: 0.1,
      targetPitch: 0,
    });
    expect(v.overshoot).toBe(false);
    expect(v.corrections).toBe(0);
  });

  it('detects overshoot past 108% of ideal', () => {
    const a = line(6, 0, 0.15);
    const b = line(4, 0.15, 0.1).slice(1);
    const path = [...a, ...b];
    const v = analyzeFlick({
      idealDeg: (0.1 * 180) / Math.PI,
      path,
      targetYaw: 0.1,
      targetPitch: 0,
    });
    expect(v.overshoot).toBe(true);
    expect(v.corrections).toBeGreaterThanOrEqual(1);
  });

  it('aggregates ratios', () => {
    const agg = aggregateFlicks([
      { overshoot: true, undershoot: false, corrections: 1, maxExtentDeg: 10 },
      { overshoot: false, undershoot: true, corrections: 2, maxExtentDeg: 3 },
      { overshoot: false, undershoot: false, corrections: 0, maxExtentDeg: 5 },
      { overshoot: false, undershoot: false, corrections: 0, maxExtentDeg: 5 },
    ]);
    expect(agg.overshootRatio).toBe(0.25);
    expect(agg.undershootRatio).toBe(0.25);
    expect(agg.cleanRatio).toBe(0.5);
    expect(agg.avgCorrections).toBe(0.75);
  });
});
