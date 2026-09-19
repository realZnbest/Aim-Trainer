/**
 * Deterministic target simulation.
 *
 * - All randomness flows from a seeded RNG (mulberry32). No Math.random.
 * - Spawning, movement (static/linear/sine/random-walk/strafe-ai), lifetimes,
 *   and hit registration are pure functions of (seed, tick index, input events).
 * - Hit registration uses the aim state AT THE SHOT TIMESTAMP, not the render
 *   frame — shots carry their own tMs and are resolved against interpolated
 *   target positions at that exact time.
 * - Angular math: targets live on a sphere around the camera at origin.
 *   Camera looks down -Z; yaw/pitch rotate the forward vector.
 *
 * @module engine/simulation
 */
import { createRng, type Rng } from './prng';
import { createPool, type Pool } from './pool';
import type {
  MovementProfile,
  ShotEvent,
  SpawnArea,
  TargetShape,
  TargetState,
  Vec3,
  WeaponProfile,
} from './types';

export interface SpawnConfig {
  shape: TargetShape;
  area: SpawnArea;
  count: number;
  lifetimeMs: number;
  movement: MovementProfile;
  minSpeed: number;
  maxSpeed: number;
  health: number;
  sizeMin: number;
  sizeMax: number;
  headshotMultiplier: number;
  weapon: WeaponProfile;
  /** Silent gap before a replacement spawns (reactive drills). 0/undefined = instant refill. */
  spawnDelayMinMs?: number;
  spawnDelayMaxMs?: number;
  /** grid snap for gridshot pattern */
  spawnPattern?: 'grid' | 'random' | 'sequence' | 'pairs';
  gridCols?: number;
  gridRows?: number;
}

export interface SimulationEvents {
  onKill?: (target: TargetState, tMs: number) => void;
  onExpire?: (target: TargetState, tMs: number) => void;
  onShot?: (shot: ShotEvent) => void;
}

const DEG = Math.PI / 180;

function randomPointInArea(area: SpawnArea, rng: Rng, out: Vec3): void {
  const minD = area.minDistance ?? 8;
  const maxD = area.maxDistance ?? 25;
  if (area.volume === 'box') {
    const h = area.halfExtents ?? { x: 6, y: 4, z: 0.5 };
    // Spawn plane: centered forward at -Z distance, spread in X/Y
    const dist = rng.range(minD, maxD);
    out.x = rng.range(-h.x, h.x);
    out.y = rng.range(-h.y, h.y);
    out.z = -dist;
    return;
  }
  if (area.volume === 'sphere') {
    const r = area.radius ?? 6;
    const dist = rng.range(minD, maxD);
    // random offset on sphere shell, projected forward
    const theta = rng.next() * Math.PI * 2;
    const rr = Math.sqrt(rng.next()) * r;
    out.x = Math.cos(theta) * rr;
    out.y = Math.sin(theta) * rr;
    out.z = -dist;
    return;
  }
  // cone
  const half = (area.coneHalfAngleDeg ?? 12) * DEG;
  const dist = rng.range(minD, maxD);
  const ang = Math.acos(1 - rng.next() * (1 - Math.cos(half)));
  const az = rng.next() * Math.PI * 2;
  out.x = dist * Math.sin(ang) * Math.cos(az);
  out.y = dist * Math.sin(ang) * Math.sin(az);
  out.z = -dist * Math.cos(ang);
}

function randomSpeed(min: number, max: number, rng: Rng): number {
  return rng.range(min, max);
}

export class Simulation {
  readonly pool: Pool<TargetState>;
  private rng: Rng;
  private cfg: SpawnConfig;
  private nextId = 1;
  private timeMs = 0;
  private events: SimulationEvents;
  private liveCount = 0;

  constructor(cfg: SpawnConfig, seed: string | number, events: SimulationEvents = {}) {
    this.cfg = cfg;
    this.rng = createRng(seed);
    this.events = events;
    this.pool = createPool<TargetState>(Math.max(8, cfg.count * 2 + 8), (i) => ({
      id: 0,
      active: false,
      shape: cfg.shape,
      radius: 0.3,
      position: { x: 0, y: 0, z: -10 },
      velocity: { x: 0, y: 0, z: 0 },
      spawnTimeMs: 0,
      lifetimeMs: cfg.lifetimeMs,
      health: cfg.health,
      dormant: false,
      seed: i,
      phase: 0,
      strafeDir: 1,
      strafeTimerMs: 0,
      basePos: { x: 0, y: 0, z: -10 },
    }));
    // Pre-fill to target count (pairs pattern gets its own left/right setup)
    if (cfg.spawnPattern === 'pairs') {
      const liveSide = this.rng.next() < 0.5 ? -1 : 1;
      this.spawnPairTarget(liveSide, false, 0);
      this.spawnPairTarget(-liveSide as -1 | 1, true, 0);
    } else {
      for (let i = 0; i < cfg.count; i++) this.spawn(0);
    }
  }

  get time(): number {
    return this.timeMs;
  }

  /** All currently active targets (snapshot into `out`, no allocation beyond caller's array). */
  collectActive(out: TargetState[]): TargetState[] {
    out.length = 0;
    // pool internals aren't iterable; track via spawned list
    for (const t of this.spawned) if (t.active) out.push(t);
    return out;
  }

  private spawned: TargetState[] = [];
  /** Scheduled replacement timestamps (reactive spawn delays). Consumed in order. */
  private spawnQueue: number[] = [];

  private delayMs(): number {
    const min = this.cfg.spawnDelayMinMs ?? 0;
    const max = Math.max(min, this.cfg.spawnDelayMaxMs ?? 0);
    if (max <= 0) return 0;
    return min + this.rng.next() * (max - min);
  }

  private spawn(nowMs: number): TargetState | null {
    const t = this.pool.acquire();
    if (!t) return null;
    t.id = this.nextId++;
    t.active = true;
    t.dormant = false; // pool reuse must never leak duel state into other modes
    t.shape = this.cfg.shape;
    t.radius = this.rng.range(this.cfg.sizeMin, this.cfg.sizeMax);
    randomPointInArea(this.cfg.area, this.rng, t.position);
    // Gridshot pattern: quantize spawn to a deterministic grid cell (data-driven)
    if (this.cfg.spawnPattern === 'grid') {
      const cols = this.cfg.gridCols ?? 3;
      const rows = this.cfg.gridRows ?? 3;
      const h = this.cfg.area.halfExtents ?? { x: 6, y: 4, z: 0.5 };
      const cx = this.rng.int(0, cols - 1);
      const cy = this.rng.int(0, rows - 1);
      t.position.x = cols === 1 ? 0 : -h.x + (2 * h.x * cx) / (cols - 1);
      t.position.y = rows === 1 ? 0 : h.y - (2 * h.y * cy) / (rows - 1);
    }
    t.basePos = { ...t.position };
    t.spawnTimeMs = nowMs;
    t.lifetimeMs = this.cfg.lifetimeMs;
    t.health = this.cfg.health;
    t.phase = this.rng.next() * Math.PI * 2;
    t.strafeDir = this.rng.next() < 0.5 ? -1 : 1;
    t.strafeTimerMs = this.rng.range(400, 1200);
    const speed = randomSpeed(this.cfg.minSpeed, this.cfg.maxSpeed, this.rng);
    const ang = this.rng.next() * Math.PI * 2;
    t.velocity = { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed, z: 0 };
    if (!this.spawned.includes(t)) this.spawned.push(t);
    this.liveCount++;
    return t;
  }

  /**
   * Pairs/duel spawn: pinned to one side of the lane. Only one target range-wide
   * is live at a time; the other waits dormant (dimmed, unhittable) until the
   * live one dies — this forces genuine left-right switching.
   */
  private spawnPairTarget(side: -1 | 1, dormant: boolean, nowMs: number): TargetState | null {
    const t = this.pool.acquire();
    if (!t) return null;
    const area = this.cfg.area;
    const minD = area.minDistance ?? 8;
    const maxD = area.maxDistance ?? 25;
    t.id = this.nextId++;
    t.active = true;
    t.dormant = dormant;
    t.shape = this.cfg.shape;
    t.radius = this.rng.range(this.cfg.sizeMin, this.cfg.sizeMax);
    t.position = {
      x: side * this.rng.range(2.5, 6.5),
      y: this.rng.range(-2.5, 2.5),
      z: -this.rng.range(minD, maxD),
    };
    t.basePos = { ...t.position };
    t.spawnTimeMs = nowMs;
    t.lifetimeMs = this.cfg.lifetimeMs;
    t.health = this.cfg.health;
    t.phase = this.rng.next() * Math.PI * 2;
    t.strafeDir = side;
    t.strafeTimerMs = 0;
    t.velocity = { x: 0, y: 0, z: 0 };
    if (!this.spawned.includes(t)) this.spawned.push(t);
    this.liveCount++;
    return t;
  }

  /** Keep the pairs duel intact: one target per side, exactly one live. */
  private refillPairs(nowMs: number): void {
    const act: TargetState[] = [];
    this.collectActive(act);
    const left = act.find((t) => t.position.x < 0);
    const right = act.find((t) => t.position.x >= 0);
    if (!left) this.spawnPairTarget(-1, true, nowMs);
    if (!right) this.spawnPairTarget(1, true, nowMs);
    // Exactly one live: if none (e.g. live one expired), wake one up.
    const live = act.find((t) => !t.dormant);
    if (!live) {
      const first = act[0] ?? this.spawned.find((t) => t.active);
      if (first) {
        first.dormant = false;
        first.spawnTimeMs = nowMs;
      }
    }
  }

  private despawn(t: TargetState): void {
    t.active = false;
    this.pool.release(t);
    this.liveCount--;
    // Reactive drills: the replacement arrives after a silent gap, not instantly.
    const d = this.delayMs();
    if (d > 0) this.spawnQueue.push(this.timeMs + d);
  }

  /** Advance simulation by dt. Maintains target count + lifetimes + movement. */
  step(dtMs: number): void {
    const dtSec = dtMs / 1000;
    this.timeMs += dtMs;
    const now = this.timeMs;

    for (const t of this.spawned) {
      if (!t.active) continue;
      // Expire
      if (this.cfg.lifetimeMs > 0 && now - t.spawnTimeMs >= t.lifetimeMs) {
        this.events.onExpire?.(t, now);
        this.despawn(t);
        continue;
      }
      this.moveTarget(t, dtSec, now);
    }
    if (this.cfg.spawnPattern === 'pairs') {
      this.refillPairs(now);
      return;
    }
    // Refill: instant when no delay is configured; otherwise each despawn
    // scheduled exactly one replacement — consume it only once due.
    const delayed = (this.cfg.spawnDelayMaxMs ?? 0) > 0;
    let active = 0;
    for (const t of this.spawned) if (t.active) active++;
    let guard = 0;
    while (active < this.cfg.count && guard++ < 16) {
      if (delayed) {
        // Queue holds non-decreasing timestamps; spawn only once one is due.
        const next = this.spawnQueue[0];
        if (next === undefined || next > now) break;
        this.spawnQueue.shift();
      }
      if (!this.spawn(now)) break;
      active++;
    }
  }

  private moveTarget(t: TargetState, dtSec: number, nowMs: number): void {
    const ageSec = (nowMs - t.spawnTimeMs) / 1000;
    switch (this.cfg.movement) {
      case 'static':
        break;
      case 'linear': {
        t.position.x = t.basePos.x + t.velocity.x * ageSec;
        t.position.y = t.basePos.y + t.velocity.y * ageSec;
        // bounce inside a soft box (|x|<9, |y|<6)
        if (Math.abs(t.position.x) > 9) {
          t.velocity.x *= -1;
          t.basePos.x = t.position.x;
          t.spawnTimeMs = nowMs; // rebase to avoid pop — deterministic (function of state)
        }
        if (Math.abs(t.position.y) > 6) {
          t.velocity.y *= -1;
          t.basePos.y = t.position.y;
          t.spawnTimeMs = nowMs;
        }
        break;
      }
      case 'sine': {
        const speed = Math.hypot(t.velocity.x, t.velocity.y) || 2;
        t.position.x = t.basePos.x + Math.sin(ageSec * speed * 0.9 + t.phase) * 3;
        t.position.y = t.basePos.y + Math.cos(ageSec * speed * 0.7 + t.phase) * 2;
        break;
      }
      case 'random-walk': {
        // Deterministic pseudo-noise from id + quantized time (no RNG consumption per tick)
        const q = Math.floor(ageSec * 8);
        const n1 = Math.sin(t.seed * 12.9898 + q * 78.233) * 43758.5453;
        const n2 = Math.sin(t.seed * 39.346 + q * 11.135) * 24634.6345;
        const f1 = n1 - Math.floor(n1) - 0.5;
        const f2 = n2 - Math.floor(n2) - 0.5;
        const sp = Math.hypot(t.velocity.x, t.velocity.y) || 2;
        t.position.x += f1 * sp * dtSec * 2;
        t.position.y += f2 * sp * dtSec * 2;
        t.position.x = Math.max(-9, Math.min(9, t.position.x));
        t.position.y = Math.max(-6, Math.min(6, t.position.y));
        break;
      }
      case 'strafe-ai': {
        // Unpredictable strafe: fast lateral bursts with random direction flips.
        t.strafeTimerMs -= dtSec * 1000;
        if (t.strafeTimerMs <= 0) {
          // Deterministic flip schedule from quantized time (not wall clock)
          const q = Math.floor(nowMs / 100);
          const h = Math.sin(t.id * 91.7 + q * 47.3) * 0.5 + 0.5;
          t.strafeDir = h < 0.45 ? -1 : 1;
          t.strafeTimerMs = 300 + h * 900;
          const sp = Math.hypot(t.velocity.x, t.velocity.y) || 4;
          t.velocity.x = t.strafeDir * sp;
          t.velocity.y = (h - 0.5) * sp * 0.6;
        }
        t.position.x += t.velocity.x * dtSec;
        t.position.y += t.velocity.y * dtSec;
        if (Math.abs(t.position.x) > 9) {
          t.velocity.x *= -1;
          t.strafeDir *= -1;
          t.position.x = Math.max(-9, Math.min(9, t.position.x));
        }
        t.position.y = Math.max(-6, Math.min(6, t.position.y));
        break;
      }
    }
  }

  /**
   * Resolve a shot fired at `shotTimeMs` with camera yaw/pitch at that instant.
   * Uses angular distance: hit if angle(ray, toTarget) <= angularRadius.
   */
  fire(
    shotTimeMs: number,
    yawRad: number,
    pitchRad: number,
    spreadYaw = 0,
    spreadPitch = 0,
  ): ShotEvent {
    // Forward vector from yaw/pitch (three.js convention, camera at origin looking -Z)
    const yaw = yawRad + spreadYaw;
    const pitch = pitchRad + spreadPitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);

    let best: TargetState | null = null;
    let bestErr = Infinity;

    for (const t of this.spawned) {
      if (!t.active || t.dormant) continue; // dormant duel targets are unhittable
      const dx = t.position.x;
      const dy = t.position.y;
      const dz = t.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= 1e-6) continue;
      const dot = (fx * dx + fy * dy + fz * dz) / dist;
      const clamped = Math.max(-1, Math.min(1, dot));
      const angDeg = (Math.acos(clamped) * 180) / Math.PI;
      const angularRadius = (Math.asin(Math.min(1, t.radius / dist)) * 180) / Math.PI;
      if (angDeg <= angularRadius && angDeg < bestErr) {
        bestErr = angDeg;
        best = t;
      }
    }

    if (!best) {
      const shot: ShotEvent = {
        tMs: shotTimeMs,
        hit: false,
        targetId: null,
        errorDeg: Infinity,
        reactionMs: null,
        damage: 0,
        killed: false,
      };
      this.events.onShot?.(shot);
      return shot;
    }

    const damage = 1; // single-hit TTK by default; multi-HP via health>1
    best.health -= damage;
    const killed = best.health <= 0;
    const shot: ShotEvent = {
      tMs: shotTimeMs,
      hit: true,
      targetId: best.id,
      errorDeg: bestErr,
      reactionMs: shotTimeMs - best.spawnTimeMs,
      damage: this.cfg.headshotMultiplier,
      killed,
    };
    if (killed) {
      this.events.onKill?.(best, shotTimeMs);
      if (this.cfg.spawnPattern === 'pairs') {
        // Duel switch: wake the waiting side, re-arm the killed side dormant.
        const killedSide = best.position.x < 0 ? -1 : 1;
        this.despawn(best);
        for (const t of this.spawned) {
          if (t.active && t !== best) {
            t.dormant = false;
            // reactionMs of the next kill now measures true switch time.
            t.spawnTimeMs = shotTimeMs;
          }
        }
        this.spawnPairTarget(killedSide, true, shotTimeMs);
      } else {
        this.despawn(best);
      }
    }
    this.events.onShot?.(shot);
    return shot;
  }
}
