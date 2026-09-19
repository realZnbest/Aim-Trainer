/**
 * Sensitivity model. `cm/360` is the source of truth.
 *
 * Converts between popular games using published yaw constants
 * (degrees of yaw per raw count / per sensitivity unit).
 *
 * Reference constants (publicly documented by community + Mouse-Sensitivity.com):
 * - Valorant: 0.07 deg/count at sens 1.0
 * - CS2: 0.022 deg/count at sens 1.0 (Source engine m_yaw)
 * - Apex Legends: 0.022 deg/count at sens 1.0 (Source-derived)
 * - Overwatch 2: 0.0066 deg/count at sens 1.0 (106.26cm/360 @ 800DPI sens 1 → back-derived)
 * - Fortnite: 0.5715 %/unit slider → 0.0095 deg/count approx at 100% (see SENSITIVITY.md)
 *
 * FOV conversions follow the focal-length (zoom-ratio) preserving approach:
 *   actual_sens = base_sens * (tan(newFov/2) / tan(oldFov/2))  for focal scaling.
 *
 * @module engine/sensitivity
 */

export type GameId = 'valorant' | 'cs2' | 'apex' | 'overwatch' | 'fortnite' | 'cm360';

/** Degrees turned per "sensitivity unit" at 1.0 — documented in docs/SENSITIVITY.md */
export const YAW_CONSTANTS_DEG: Record<Exclude<GameId, 'cm360'>, number> = {
  valorant: 0.07,
  cs2: 0.022,
  apex: 0.022,
  overwatch: 0.0066,
  fortnite: 0.0095,
};

export interface ConvertInput {
  from: GameId;
  /** in-game sensitivity value (ignored when from === 'cm360') */
  sens: number;
  /** mouse DPI */
  dpi: number;
}

export const INCH_TO_CM = 2.54;

/**
 * Convert any game's sens+DPI to cm/360 (source of truth).
 * Formula: cm/360 = (360 / (yawPerCount * countsPerInch... )) — simplified:
 *   inches/360 = 360 / (sens * yawConstant * dpi)  →  cm360 = inches360 * 2.54
 */
export function toCm360(input: ConvertInput): number {
  const { from, sens, dpi } = input;
  if (dpi <= 0) throw new Error('DPI must be > 0');
  if (from === 'cm360') {
    if (sens <= 0) throw new Error('cm/360 must be > 0');
    return sens;
  }
  if (sens <= 0) throw new Error('Sensitivity must be > 0');
  const yaw = YAW_CONSTANTS_DEG[from];
  const inchesPer360 = 360 / (sens * yaw * dpi);
  return inchesPer360 * INCH_TO_CM;
}

/**
 * Convert cm/360 back to a target game's sensitivity at a given DPI.
 */
export function fromCm360(cm360: number, to: Exclude<GameId, 'cm360'>, dpi: number): number {
  if (cm360 <= 0) throw new Error('cm/360 must be > 0');
  if (dpi <= 0) throw new Error('DPI must be > 0');
  const yaw = YAW_CONSTANTS_DEG[to];
  const inchesPer360 = cm360 / INCH_TO_CM;
  return 360 / (inchesPer360 * yaw * dpi);
}

/** Degrees of yaw produced by one raw mouse count at given game sens. */
export function degreesPerCount(game: Exclude<GameId, 'cm360'>, sens: number): number {
  return YAW_CONSTANTS_DEG[game] * sens;
}

/**
 * Radians of camera rotation for a raw movementX delta, given cm/360 calibration.
 * This is what the engine uses per sub-frame input event — no acceleration, no smoothing.
 */
export function radiansForDeltaPx(
  movementPx: number,
  cm360: number,
  dpi: number,
  axisMultiplier = 1,
): number {
  const inches = (movementPx * axisMultiplier) / dpi;
  const cm = inches * INCH_TO_CM;
  const revolutions = cm / cm360;
  return revolutions * Math.PI * 2;
}

/** Vertical FOV → horizontal FOV given aspect. */
export function verticalToHorizontalFov(vfovDeg: number, aspect: number): number {
  const v = (vfovDeg * Math.PI) / 360;
  const h = 2 * Math.atan(Math.tan(v) * aspect);
  return (h * 180) / Math.PI;
}

/** Horizontal FOV → vertical FOV given aspect. */
export function horizontalToVerticalFov(hfovDeg: number, aspect: number): number {
  const h = (hfovDeg * Math.PI) / 360;
  const v = 2 * Math.atan(Math.tan(h) / aspect);
  return (v * 180) / Math.PI;
}

/** Focal-length preserving sensitivity scale factor when FOV changes. */
export function focalScaleFactor(fromFovDeg: number, toFovDeg: number): number {
  const a = Math.tan((fromFovDeg * Math.PI) / 180 / 2);
  const b = Math.tan((toFovDeg * Math.PI) / 180 / 2);
  return b / a;
}
