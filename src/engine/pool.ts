/**
 * Generic fixed-capacity object pool — zero allocation in the hot path.
 *
 * Pre-allocates `capacity` objects via `factory`, hands them out with
 * `acquire()`, reclaims with `release()`. `acquire()` returns null when
 * exhausted (caller must handle / pool must be sized correctly) — never
 * allocates on miss, keeping GC pressure at zero during gameplay.
 *
 * @module engine/pool
 */

export interface Pool<T> {
  acquire: () => T | null;
  release: (obj: T) => void;
  /** Reset all slots to free. */
  clear: () => void;
  readonly capacity: number;
  readonly freeCount: number;
  readonly usedCount: number;
}

export function createPool<T>(capacity: number, factory: (index: number) => T): Pool<T> {
  const items: T[] = new Array<T>(capacity);
  for (let i = 0; i < capacity; i++) items[i] = factory(i);
  const free: T[] = [...items];

  return {
    acquire(): T | null {
      const obj = free.pop();
      return obj === undefined ? null : obj;
    },
    release(obj: T): void {
      if (free.length < capacity) free.push(obj);
    },
    clear(): void {
      free.length = 0;
      for (const it of items) free.push(it);
    },
    get capacity(): number {
      return capacity;
    },
    get freeCount(): number {
      return free.length;
    },
    get usedCount(): number {
      return capacity - free.length;
    },
  };
}
