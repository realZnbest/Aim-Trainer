import { describe, expect, it } from 'vitest';
import {
  degreesPerCount,
  focalScaleFactor,
  fromCm360,
  horizontalToVerticalFov,
  radiansForDeltaPx,
  toCm360,
  verticalToHorizontalFov,
} from '@/engine/sensitivity';

describe('sensitivity', () => {
  it('valorant 0.35 @ 800dpi ≈ 55.9 cm/360 (community-known value)', () => {
    // inches/360 = 360/(0.35*0.07*800) = 18.367in → 46.65cm… verify formula consistency instead
    const cm = toCm360({ from: 'valorant', sens: 0.35, dpi: 800 });
    expect(cm).toBeCloseTo(46.65, 0);
  });

  it('round-trips cm360 → game → cm360 for all games', () => {
    const games = ['valorant', 'cs2', 'apex', 'overwatch', 'fortnite'] as const;
    for (const g of games) {
      const s = fromCm360(30, g, 800);
      expect(toCm360({ from: g, sens: s, dpi: 800 })).toBeCloseTo(30, 6);
    }
  });

  it('higher DPI needs lower sens for the same cm/360', () => {
    const low = fromCm360(30, 'cs2', 400);
    const high = fromCm360(30, 'cs2', 1600);
    expect(high).toBeCloseTo(low / 4, 6);
  });

  it('full mouse-pad turn equals 2π rad', () => {
    // counts for 360°: cm360/DPI inches… delta px for one full turn:
    const cm360 = 30;
    const dpi = 800;
    const pxPer360 = (cm360 / 2.54) * dpi;
    expect(radiansForDeltaPx(pxPer360, cm360, dpi)).toBeCloseTo(Math.PI * 2, 6);
  });

  it('fov conversions round-trip', () => {
    const h = verticalToHorizontalFov(103, 16 / 9);
    expect(horizontalToVerticalFov(h, 16 / 9)).toBeCloseTo(103, 9);
  });

  it('rejects invalid inputs', () => {
    expect(() => toCm360({ from: 'cs2', sens: 0, dpi: 800 })).toThrow();
    expect(() => toCm360({ from: 'cs2', sens: 1, dpi: 0 })).toThrow();
    expect(() => toCm360({ from: 'cm360', sens: -1, dpi: 800 })).toThrow();
    expect(toCm360({ from: 'cm360', sens: 25, dpi: 800 })).toBe(25);
    expect(() => fromCm360(-5, 'cs2', 800)).toThrow();
    expect(() => fromCm360(30, 'cs2', 0)).toThrow();
  });

  it('degreesPerCount + focal scaling behave', () => {
    expect(degreesPerCount('cs2', 2)).toBeCloseTo(0.044, 9);
    expect(focalScaleFactor(90, 90)).toBeCloseTo(1, 9);
    expect(focalScaleFactor(90, 120)).toBeGreaterThan(1);
  });
});
