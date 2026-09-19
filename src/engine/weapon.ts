/**
 * Weapon model: fire modes, RPM gating, spread, recoil, ammo/reload.
 * Pure + deterministic — driven by sim time, never wall-clock.
 * @module engine/weapon
 */
import type { WeaponProfile } from './types';
import type { Rng } from './prng';

export interface WeaponState {
  ammo: number;
  reloadingUntilMs: number;
  lastShotMs: number;
  recoilPitchRad: number;
}

export function createWeaponState(profile: WeaponProfile): WeaponState {
  return { ammo: profile.magazine, reloadingUntilMs: -1, lastShotMs: -1e9, recoilPitchRad: 0 };
}

export interface TriggerResult {
  fired: boolean;
  /** reason when not fired */
  reason?: 'rpm' | 'reloading' | 'empty' | 'semi-already-fired';
}

/**
 * Attempt to fire at sim time `nowMs`. Returns whether a shot was produced.
 * For `click` (semi-auto) the caller must ensure one trigger per press
 * (pass `pressed` edge, not held state).
 */
export function tryTrigger(
  profile: WeaponProfile,
  state: WeaponState,
  nowMs: number,
  pressed: boolean,
  heldSinceMs: number,
): TriggerResult {
  if (!pressed) return { fired: false };
  if (nowMs < state.reloadingUntilMs) return { fired: false, reason: 'reloading' };
  if (state.ammo <= 0) {
    state.reloadingUntilMs = nowMs + profile.reloadMs;
    state.ammo = profile.magazine;
    return { fired: false, reason: 'empty' };
  }
  const intervalMs = 60_000 / profile.rpm;
  if (profile.fireMode === 'click') {
    // semi: allow fire only if this press is newer than the last shot
    if (heldSinceMs <= state.lastShotMs) return { fired: false, reason: 'semi-already-fired' };
  } else {
    if (nowMs - state.lastShotMs < intervalMs) return { fired: false, reason: 'rpm' };
  }
  state.lastShotMs = nowMs;
  state.ammo -= 1;
  state.recoilPitchRad += ((profile.recoilDeg * Math.PI) / 180) * 0.5;
  if (state.ammo === 0) {
    state.reloadingUntilMs = nowMs + profile.reloadMs;
    // instant refill marker; actual ammo refills when reload completes (see updateWeapon)
  }
  return { fired: true };
}

/** Tick recoil recovery + reload completion. Call every sim step. */
export function updateWeapon(
  profile: WeaponProfile,
  state: WeaponState,
  nowMs: number,
  dtSec: number,
): void {
  // Exponential recoil recovery (~8/s)
  const k = Math.exp(-8 * dtSec);
  state.recoilPitchRad *= k;
  if (nowMs >= state.reloadingUntilMs && state.reloadingUntilMs > 0 && state.ammo === 0) {
    state.ammo = profile.magazine;
    state.reloadingUntilMs = -1;
  }
}

/** Roll a spread offset (radians) using the sim RNG. Uniform in disc. */
export function rollSpreadRad(spreadDeg: number, rng: Rng): { yaw: number; pitch: number } {
  if (spreadDeg <= 0) return { yaw: 0, pitch: 0 };
  const rMax = ((spreadDeg * Math.PI) / 180) * Math.sqrt(rng.next());
  const a = rng.next() * Math.PI * 2;
  return { yaw: Math.cos(a) * rMax, pitch: Math.sin(a) * rMax };
}
