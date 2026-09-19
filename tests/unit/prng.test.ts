import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, mulberry32 } from '@/engine/prng';

describe('prng', () => {
  it('mulberry32 is deterministic for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(Array.from({ length: 10 }, () => a())).toEqual(Array.from({ length: 10 }, () => b()));
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('hashSeed is stable', () => {
    expect(hashSeed('gridshot')).toBe(hashSeed('gridshot'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('createRng range/int/pick stay in bounds and fork is deterministic', () => {
    const rng = createRng('test-seed');
    for (let i = 0; i < 100; i++) {
      expect(rng.range(2, 5)).toBeGreaterThanOrEqual(2);
      expect(rng.range(2, 5)).toBeLessThan(5);
      expect(rng.int(1, 3)).toBeGreaterThanOrEqual(1);
      expect(rng.int(1, 3)).toBeLessThanOrEqual(3);
      expect([10, 20, 30]).toContain(rng.pick([10, 20, 30] as const));
    }
    const f1 = createRng('x').fork('salt').next();
    const f2 = createRng('x').fork('salt').next();
    expect(f1).toBe(f2);
  });
});
