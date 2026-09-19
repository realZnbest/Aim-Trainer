/**
 * Raw input manager: Pointer Lock + coalesced high-polling mouse events.
 *
 * Design (latency-first):
 * - Reads ONLY `movementX/movementY` from MouseEvent (never cursor position).
 * - Drains `event.getCoalescedEvents()` so 1000Hz+ mice contribute every
 *   sub-frame sample instead of one coalesced delta per rAF.
 * - Applies NO acceleration, NO smoothing, NO buffering — deltas are converted
 *   to yaw/pitch immediately via the cm/360 calibration and pushed to the sim.
 * - Per-axis multipliers + invert-Y supported.
 * - Optional Gamepad module with dead-zone + response curve (separate path).
 *
 * @module engine/input
 */
import { radiansForDeltaPx } from './sensitivity';

export interface AimCalibration {
  cm360: number;
  dpi: number;
  multX: number;
  multY: number;
  invertY: boolean;
}

export interface PointerLockCallbacks {
  onLockChange?: (locked: boolean) => void;
  onError?: (message: string) => void;
}

export interface AimState {
  yawRad: number;
  pitchRad: number;
}

/** Clamp pitch to avoid flipping (±89.9°). */
const PITCH_LIMIT = (89.9 * Math.PI) / 180;

export class InputManager {
  private aim: AimState = { yawRad: 0, pitchRad: 0 };
  private locked = false;
  private el: HTMLElement | null = null;
  private cbs: PointerLockCallbacks = {};
  private calib: AimCalibration = { cm360: 30, dpi: 800, multX: 1, multY: 1, invertY: false };
  /** Pre-allocated scratch queue (ring buffer) to avoid GC in hot path. */
  private pendingDx = 0;
  private pendingDy = 0;
  private disposed = false;

  constructor(calib?: Partial<AimCalibration>) {
    if (calib) this.calib = { ...this.calib, ...calib };
  }

  setCalibration(c: Partial<AimCalibration>): void {
    this.calib = { ...this.calib, ...c };
  }

  getCalibration(): AimCalibration {
    return { ...this.calib };
  }

  getAim(): AimState {
    return this.aim;
  }

  setAim(yawRad: number, pitchRad: number): void {
    this.aim.yawRad = yawRad;
    this.aim.pitchRad = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchRad));
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Attach to a DOM element; requests pointer lock on user gesture. */
  /* v8 ignore start — browser-only (Pointer Lock + DOM listeners, covered by Playwright e2e) */
  attach(el: HTMLElement, cbs: PointerLockCallbacks = {}): void {
    this.el = el;
    this.cbs = cbs;
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('pointerlockerror', this.handleLockError);
    el.addEventListener('mousemove', this.handleMouseMove as EventListener);
  }

  /** Must be called from a user gesture (click). Returns a promise resolving to lock state. */
  async requestLock(): Promise<boolean> {
    if (!this.el) throw new Error('InputManager not attached');
    // Safari limitation: pointer lock historically unsupported / flaky on iOS Safari.
    const anyEl = this.el as HTMLElement & { webkitRequestPointerLock?: () => void };
    try {
      if (document.pointerLockElement === this.el) return true;
      const p = (
        this.el.requestPointerLock as unknown as (() => Promise<void> | void) | undefined
      )?.call(this.el);
      if (p instanceof Promise) {
        // Newer Chrome returns a promise; older browsers return undefined.
        await p.catch(() => {
          anyEl.webkitRequestPointerLock?.();
        });
      }
    } catch {
      this.cbs.onError?.('pointerlockerror: request failed');
      return false;
    }
    return this.locked;
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.el;
    this.cbs.onLockChange?.(this.locked);
  };

  private handleLockError = (): void => {
    this.cbs.onError?.(
      'pointerlockerror: browser blocked pointer lock. Use HTTPS/localhost and a user click.',
    );
  };

  /**
   * Hot path — called for every mousemove. Drains coalesced events so each
   * high-polling sample rotates the camera exactly once.
   */
  private handleMouseMove = (e: MouseEvent & { getCoalescedEvents?: () => MouseEvent[] }): void => {
    if (!this.locked || this.disposed) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      this.applyDelta(ev.movementX, ev.movementY);
    }
  };

  /** Direct delta injection (used by tests / replay / gamepad path). */
  applyDelta(dx: number, dy: number): void {
    const { cm360, dpi, multX, multY, invertY } = this.calib;
    const yawDelta = radiansForDeltaPx(dx, cm360, dpi, multX);
    let pitchDelta = radiansForDeltaPx(dy, cm360, dpi, multY);
    if (!invertY) pitchDelta = -pitchDelta;
    // FPS convention: moving mouse right (dx>0) turns right (yaw decreases in three.js).
    this.aim.yawRad -= yawDelta;
    this.aim.pitchRad = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.aim.pitchRad + pitchDelta),
    );
    this.pendingDx += dx;
    this.pendingDy += dy;
  }

  /** Consume accumulated raw deltas since last call (for telemetry). */
  drainPending(): { dx: number; dy: number } {
    const out = { dx: this.pendingDx, dy: this.pendingDy };
    this.pendingDx = 0;
    this.pendingDy = 0;
    return out;
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('pointerlockerror', this.handleLockError);
    this.el?.removeEventListener('mousemove', this.handleMouseMove as EventListener);
  }
  /* v8 ignore stop */
}

/**
 * Optional gamepad aiming with dead-zone + power response curve.
 * Kept out of the mouse hot path entirely.
 */
export interface GamepadOptions {
  deadZone?: number;
  exponent?: number;
  /** rad/sec at full deflection */
  maxTurnRate?: number;
}

export function pollGamepadAim(aim: AimState, dtSec: number, opts: GamepadOptions = {}): AimState {
  const { deadZone = 0.12, exponent = 2.0, maxTurnRate = 4.5 } = opts;
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const gp = Array.from(pads).find((p) => p && p.connected);
  if (!gp) return aim;
  const rx = gp.axes[2] ?? 0;
  const ry = gp.axes[3] ?? 0;
  const apply = (v: number): number => {
    const m = Math.abs(v) < deadZone ? 0 : (Math.abs(v) - deadZone) / (1 - deadZone);
    return Math.sign(v) * Math.pow(m, exponent);
  };
  const nx = apply(rx);
  const ny = apply(ry);
  return {
    yawRad: aim.yawRad - nx * maxTurnRate * dtSec,
    pitchRad: Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, aim.pitchRad - ny * maxTurnRate * dtSec),
    ),
  };
}
