/**
 * Deterministic replay: seed + input event stream → identical results.
 * The recorder captures (tMs, yaw, pitch, trigger) per event; the player
 * re-runs the Simulation with the same seed and applies inputs at the same
 * sim timestamps. Verified by `tests/determinism.test.ts`.
 * @module analytics/replay
 */

export interface ReplayInputEvent {
  tMs: number;
  yawRad: number;
  pitchRad: number;
  trigger: boolean;
}

export interface Replay {
  version: 1;
  seed: string;
  scenarioId: string;
  startedAt: string;
  events: ReplayInputEvent[];
}

export function createReplay(seed: string, scenarioId: string): Replay {
  return { version: 1, seed, scenarioId, startedAt: new Date().toISOString(), events: [] };
}

/** Record one input event (caller owns timing; uses sim time). */
export function recordEvent(r: Replay, e: ReplayInputEvent): void {
  r.events.push(e);
}

export function serializeReplay(r: Replay): string {
  return JSON.stringify(r);
}

export function deserializeReplay(json: string): Replay {
  const v = JSON.parse(json) as { version?: unknown; seed?: unknown; events?: unknown };
  if (v.version !== 1 || typeof v.seed !== 'string' || !Array.isArray(v.events)) {
    throw new Error('Invalid replay');
  }
  return v as Replay;
}
