import { describe, expect, it } from 'vitest';
import { computeScore } from '@/analytics/scoring';

describe('scoring', () => {
  it('is deterministic', () => {
    const i = {
      hits: 80,
      shots: 100,
      kills: 120,
      durationSec: 60,
      medianErrorDeg: 0.8,
      avgTargetSize: 0.32,
      avgTargetSpeed: 0,
      targetCount: 3,
    };
    expect(computeScore(i)).toEqual(computeScore(i));
  });

  it('golden value: 80% acc, 2kps gridshot-class run', () => {
    const r = computeScore({
      hits: 80,
      shots: 100,
      kills: 120,
      durationSec: 60,
      medianErrorDeg: 0.8,
      avgTargetSize: 0.32,
      avgTargetSpeed: 0,
      targetCount: 3,
    });
    expect(r.accuracy).toBe(0.8);
    expect(r.killsPerSec).toBe(2);
    expect(r.score).toBe(782);
  });

  it('perfect fast run scores near max * difficulty', () => {
    const r = computeScore({
      hits: 240,
      shots: 240,
      kills: 240,
      durationSec: 60,
      medianErrorDeg: 0.1,
      avgTargetSize: 0.14,
      avgTargetSpeed: 6,
      targetCount: 5,
    });
    expect(r.score).toBeGreaterThan(1000);
  });

  it('zero shots → zero accuracy, no crash', () => {
    const r = computeScore({
      hits: 0,
      shots: 0,
      kills: 0,
      durationSec: 60,
      medianErrorDeg: 0,
      avgTargetSize: 0.3,
      avgTargetSpeed: 0,
      targetCount: 1,
    });
    expect(r.accuracy).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
