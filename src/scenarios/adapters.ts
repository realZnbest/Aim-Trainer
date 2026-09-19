/**
 * Helpers: scenario → engine SpawnConfig adapter + difficulty scaling.
 * @module scenarios/adapters
 */
import type { SpawnConfig } from '@/engine/simulation';
import type { Scenario } from './schema';

export function scenarioToSpawnConfig(s: Scenario): SpawnConfig {
  return {
    shape: s.targetShape,
    area: {
      volume: s.spawnArea.volume,
      halfExtents: s.spawnArea.halfExtents,
      radius: s.spawnArea.radius,
      coneHalfAngleDeg: s.spawnArea.coneHalfAngleDeg,
      minDistance: s.spawnArea.minDistance,
      maxDistance: s.spawnArea.maxDistance,
    },
    count: s.targetCount,
    lifetimeMs: s.targetLifetimeMs,
    movement: s.movementProfile,
    minSpeed: s.minSpeed,
    maxSpeed: s.maxSpeed,
    health: s.health,
    sizeMin: s.targetSize,
    sizeMax: s.targetSizeMax,
    headshotMultiplier: s.headshotMultiplier,
    weapon: s.weapon,
    spawnPattern: s.spawnPattern,
    gridCols: s.gridCols,
    gridRows: s.gridRows,
  };
}

/** Adaptive difficulty: shrink targets / speed up movement every N sec. Pure function. */
export function scaleDifficulty(s: Scenario, elapsedSec: number): Scenario {
  if (!s.difficultyScaling.enabled) return s;
  const steps = Math.floor(elapsedSec / s.difficultyScaling.adjustEverySec);
  if (steps <= 0) return s;
  return {
    ...s,
    targetSize: Math.max(0.08, s.targetSize * Math.pow(s.difficultyScaling.sizeFactor, steps)),
    maxSpeed: Math.min(30, s.maxSpeed * Math.pow(s.difficultyScaling.speedFactor, steps)),
  };
}
