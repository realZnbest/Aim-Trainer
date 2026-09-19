/**
 * Scenario Schema (Zod) — data-driven game modes.
 * Adding a new mode = adding a JSON file. Engine code never changes.
 * @module scenarios/schema
 */
import { z } from 'zod';

export const targetShapeSchema = z.enum(['sphere', 'capsule', 'plane']);
export const spawnVolumeSchema = z.enum(['box', 'sphere', 'cone']);
export const movementProfileSchema = z.enum([
  'static',
  'linear',
  'sine',
  'random-walk',
  'strafe-ai',
]);
export const fireModeSchema = z.enum(['click', 'auto']);

export const spawnAreaSchema = z.object({
  volume: spawnVolumeSchema,
  halfExtents: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  radius: z.number().positive().optional(),
  coneHalfAngleDeg: z.number().min(1).max(60).optional(),
  minDistance: z.number().min(2).default(8),
  maxDistance: z.number().max(120).default(25),
});

export const weaponProfileSchema = z.object({
  fireMode: fireModeSchema.default('click'),
  rpm: z.number().min(30).max(1200).default(600),
  recoilDeg: z.number().min(0).max(5).default(0),
  spreadDeg: z.number().min(0).max(5).default(0),
  magazine: z.number().int().min(1).max(1000).default(30),
  reloadMs: z.number().min(0).max(10_000).default(1200),
});

export const scoringWeightsSchema = z.object({
  accuracy: z.number().min(0).max(2).default(1),
  speed: z.number().min(0).max(2).default(1),
  precision: z.number().min(0).max(2).default(1),
});

export const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  mode: z.enum([
    'gridshot',
    'spidershot',
    'microshot',
    'tracking',
    'switching',
    'reflex',
    'strafe-track',
    'target-switching-speed',
    'custom',
  ]),
  durationSec: z.number().int().min(5).max(1800).default(60),
  targetSize: z.number().positive().default(0.3),
  targetSizeMax: z.number().positive().default(0.3),
  targetShape: targetShapeSchema.default('sphere'),
  spawnArea: spawnAreaSchema,
  spawnPattern: z.enum(['grid', 'random', 'sequence', 'pairs']).default('random'),
  targetCount: z.number().int().min(1).max(64).default(3),
  targetLifetimeMs: z.number().int().min(0).max(60_000).default(0),
  movementProfile: movementProfileSchema.default('static'),
  minSpeed: z.number().min(0).max(60).default(0),
  maxSpeed: z.number().min(0).max(60).default(0),
  health: z.number().int().min(1).max(1000).default(1),
  headshotMultiplier: z.number().min(0.5).max(10).default(1),
  weapon: weaponProfileSchema.default({}),
  scoringWeights: scoringWeightsSchema.default({}),
  difficultyScaling: z
    .object({
      enabled: z.boolean().default(false),
      adjustEverySec: z.number().default(15),
      sizeFactor: z.number().default(0.95),
      speedFactor: z.number().default(1.05),
    })
    .default({}),
  gridCols: z.number().int().min(1).max(8).optional(),
  gridRows: z.number().int().min(1).max(8).optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

/** Validate unknown JSON into a Scenario; throws with readable issues. */
export function parseScenario(json: unknown): Scenario {
  return scenarioSchema.parse(json);
}

/** Type-guard that returns issues instead of throwing (for the sandbox editor). */
export function validateScenario(
  json: unknown,
): { ok: true; value: Scenario } | { ok: false; errors: string[] } {
  const r = scenarioSchema.safeParse(json);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
