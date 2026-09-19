/**
 * Arena clear-zone invariants: no decor may ever occlude a target.
 * @module tests/unit/arena
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import { parseScenario, type Scenario } from '@/scenarios/schema';
import { computeDims } from '@/ui/components/ArenaEnvironment';

const sandboxBase = BUILT_IN_SCENARIOS.find((s) => s.id === 'sandbox');
if (!sandboxBase) throw new Error('missing sandbox builtin');

function custom(patch: Partial<Scenario>): Scenario {
  return parseScenario({ ...sandboxBase, id: 'sandbox-test', ...patch });
}

const EXTREMES: Scenario[] = [
  ...BUILT_IN_SCENARIOS,
  // Pathological sandbox configs must still keep the lane clear.
  custom({
    spawnArea: { volume: 'cone', coneHalfAngleDeg: 60, minDistance: 2, maxDistance: 120 },
    targetSize: 0.05,
    targetSizeMax: 2,
  }),
  custom({
    spawnArea: { volume: 'box', halfExtents: { x: 20, y: 15, z: 0.5 }, minDistance: 2, maxDistance: 120 },
  }),
  custom({
    spawnArea: { volume: 'sphere', radius: 20, minDistance: 2, maxDistance: 60 },
  }),
];

describe('arena clear zone', () => {
  for (const s of EXTREMES) {
    it(`${s.id}: decor stays outside the target lane`, () => {
      const d = computeDims(s);
      const maxR = Math.max(s.targetSize, s.targetSizeMax);

      // Side walls + columns stand beyond the widest reachable target edge.
      expect(d.sideX - 2.3).toBeGreaterThan(d.effX + maxR);
      // Floor / ceiling clear the lowest / highest reachable target edge.
      expect(d.floorY).toBeLessThan(-(d.effY + maxR));
      expect(d.ceilY).toBeGreaterThan(d.effY + maxR);
      // Front wall face sits well behind the farthest target.
      expect(d.frontZ + 0.4).toBeLessThan(-s.spawnArea.maxDistance - 5);
      // Back-wall furniture (z > 0) can never occlude front-spawned targets.
      expect(d.backZ).toBeGreaterThan(0);
      // Bollard tips stay ~2m below the lowest possible sightline.
      expect(d.floorY + 1.06).toBeLessThan(-d.effY);
    });
  }
});
