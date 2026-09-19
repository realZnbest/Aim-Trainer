/**
 * Shared engine types. Simulation is framework-agnostic and fully deterministic.
 * @module engine/types
 */

export type Vec3 = { x: number; y: number; z: number };

export type TargetShape = 'sphere' | 'capsule' | 'plane';
export type SpawnVolume = 'box' | 'sphere' | 'cone';
export type MovementProfile = 'static' | 'linear' | 'sine' | 'random-walk' | 'strafe-ai';
export type FireMode = 'click' | 'auto';

export interface WeaponProfile {
  fireMode: FireMode;
  /** rounds per minute (auto) */
  rpm: number;
  /** degrees of recoil kick per shot (applied to pitch) */
  recoilDeg: number;
  /** spread in degrees (cone half-angle) */
  spreadDeg: number;
  magazine: number;
  reloadMs: number;
}

export interface SpawnArea {
  volume: SpawnVolume;
  /** box half-extents (m) OR sphere radius OR cone params */
  halfExtents?: Vec3;
  radius?: number;
  /** cone: half-angle deg + distance range */
  coneHalfAngleDeg?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface TargetState {
  id: number;
  active: boolean;
  shape: TargetShape;
  /** radius in meters (sphere) / half-height for capsule */
  radius: number;
  position: Vec3;
  velocity: Vec3;
  spawnTimeMs: number;
  lifetimeMs: number;
  health: number;
  /** pairs/duel pattern: only non-dormant targets are hittable */
  dormant: boolean;
  /** movement bookkeeping */
  seed: number;
  phase: number;
  strafeDir: number;
  strafeTimerMs: number;
  basePos: Vec3;
}

export interface ShotEvent {
  /** simulation time of the actual shot (performance.now-based, ms) */
  tMs: number;
  hit: boolean;
  targetId: number | null;
  /** angular error in degrees between crosshair ray and target center */
  errorDeg: number;
  /** reaction time since target spawn (ms) */
  reactionMs: number | null;
  damage: number;
  killed: boolean;
}

export interface InputSample {
  tMs: number;
  dx: number;
  dy: number;
  yawRad: number;
  pitchRad: number;
}

export interface SimConfig {
  seed: string;
  tickHz: number;
  maxTargets: number;
}

export interface CrosshairPathPoint {
  tMs: number;
  yawRad: number;
  pitchRad: number;
}
