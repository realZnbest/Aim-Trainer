/**
 * Deterministic seeded PRNG (mulberry32) + string seed hashing.
 *
 * RULE: gameplay code MUST use this. `Math.random` is forbidden in
 * simulation/replay paths so replays are bit-for-bit deterministic.
 *
 * @module engine/prng
 */

/** Hash an arbitrary string seed to a uint32. FNV-1a. */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG factory. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Float in [0, 1) */
  next: () => number;
  /** Float in [min, max) */
  range: (min: number, max: number) => number;
  /** Integer in [min, max] */
  int: (min: number, max: number) => number;
  /** Pick one element */
  pick: <T>(arr: readonly T[]) => T;
  /** Fork an independent stream (deterministic) */
  fork: (salt: string) => Rng;
}

/** Create a deterministic RNG from a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  const base = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  const rand = mulberry32(base);
  const rng: Rng = {
    next: () => rand(),
    range: (min: number, max: number) => min + rand() * (max - min),
    int: (min: number, max: number) => Math.floor(min + rand() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error('pick() of empty array');
      return arr[Math.floor(rand() * arr.length)] as T;
    },
    fork: (salt: string) => createRng(hashSeed(`${String(base)}:${salt}`)),
  };
  return rng;
}
