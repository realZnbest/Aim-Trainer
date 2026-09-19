import { describe, expect, it } from 'vitest';
import {
  mean,
  median,
  normalCdf,
  percentile,
  stddev,
  summarize,
  zScore,
} from '@/analytics/statistics';

describe('statistics', () => {
  it('mean/median/percentile/sd', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 2);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });

  it('empty samples → zeros', () => {
    expect(summarize([])).toMatchObject({ count: 0, mean: 0, sd: 0 });
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(percentile([], 95)).toBe(0);
    expect(stddev([5])).toBe(0);
  });

  it('summarize computes min/max/p95', () => {
    const s = summarize([100, 200, 300, 400, 500]);
    expect(s.count).toBe(5);
    expect(s.median).toBe(300);
    expect(s.min).toBe(100);
    expect(s.max).toBe(500);
  });

  it('zScore + normalCdf behave', () => {
    expect(zScore(130, 100, 15)).toBeCloseTo(2, 9);
    expect(normalCdf(0)).toBeCloseTo(0.5, 3);
    expect(normalCdf(3)).toBeGreaterThan(0.99);
    expect(zScore(5, 5, 0)).toBe(0);
  });
});
