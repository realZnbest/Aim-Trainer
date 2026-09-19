/**
 * Flick analysis: overshoot / undershoot + correction counting.
 *
 * Model: for each kill we look at the crosshair path (yaw/pitch samples) from
 * target spawn → kill. Project the path onto the ideal flick axis (start→target
 * direction at spawn). Let:
 *   dIdeal  = angular distance start→target-center
 *   dMax    = max projection of the path along the axis
 *   dFinal  = projection at kill time (≈ dIdeal for a hit)
 * - Overshoot: dMax > dIdeal * 1.08  (passed the target by >8%)
 * - Undershoot: kill required ≥1 direction reversal AND dMax < dIdeal * 0.92
 * - Correction: sign change of axial velocity after covering 40% of dIdeal.
 *
 * @module analytics/flick
 */
import type { CrosshairPathPoint } from '@/engine/types';

export interface FlickSample {
  /** angular distance start→target center (deg) */
  idealDeg: number;
  /** crosshair path from spawn to kill */
  path: CrosshairPathPoint[];
  /** target angular position (yaw/pitch rad) at spawn */
  targetYaw: number;
  targetPitch: number;
}

export interface FlickVerdict {
  overshoot: boolean;
  undershoot: boolean;
  corrections: number;
  maxExtentDeg: number;
}

const RAD2DEG = 180 / Math.PI;

/** Shortest angular delta. */
function angDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function analyzeFlick(s: FlickSample): FlickVerdict {
  if (s.path.length < 2 || s.idealDeg <= 1e-6) {
    return { overshoot: false, undershoot: false, corrections: 0, maxExtentDeg: 0 };
  }
  const start = s.path[0] as CrosshairPathPoint;
  // Ideal axis in yaw/pitch space
  const axYaw = angDelta(s.targetYaw, start.yawRad);
  const axPitch = s.targetPitch - start.pitchRad;
  const axLen = Math.hypot(axYaw, axPitch) || 1e-9;
  const ux = axYaw / axLen;
  const uy = axPitch / axLen;

  let maxProj = -Infinity;
  let corrections = 0;
  let prevVel = 0;
  let covered40 = false;

  for (let i = 0; i < s.path.length; i++) {
    const p = s.path[i] as CrosshairPathPoint;
    const rx = angDelta(p.yawRad, start.yawRad);
    const ry = p.pitchRad - start.pitchRad;
    const proj = (rx * ux + ry * uy) * RAD2DEG;
    if (proj > maxProj) maxProj = proj;
    if (proj >= s.idealDeg * 0.4) covered40 = true;
    if (i > 0) {
      const q = s.path[i - 1] as CrosshairPathPoint;
      const qrx = angDelta(q.yawRad, start.yawRad);
      const qry = q.pitchRad - start.pitchRad;
      const qproj = (qrx * ux + qry * uy) * RAD2DEG;
      const vel = proj - qproj;
      if (
        covered40 &&
        prevVel !== 0 &&
        Math.sign(vel) !== Math.sign(prevVel) &&
        Math.abs(vel) > 0.05
      ) {
        corrections++;
      }
      if (Math.abs(vel) > 1e-9) prevVel = vel;
    }
  }

  const overshoot = maxProj > s.idealDeg * 1.08;
  const undershoot = !overshoot && corrections > 0 && maxProj < s.idealDeg * 0.92;
  return { overshoot, undershoot, corrections, maxExtentDeg: maxProj };
}

export interface FlickAggregate {
  overshootRatio: number;
  undershootRatio: number;
  cleanRatio: number;
  avgCorrections: number;
}

/** Aggregate verdicts into ratios. */
export function aggregateFlicks(v: FlickVerdict[]): FlickAggregate {
  if (v.length === 0) {
    return { overshootRatio: 0, undershootRatio: 0, cleanRatio: 0, avgCorrections: 0 };
  }
  let over = 0;
  let under = 0;
  let corr = 0;
  for (const x of v) {
    if (x.overshoot) over++;
    else if (x.undershoot) under++;
    corr += x.corrections;
  }
  return {
    overshootRatio: over / v.length,
    undershootRatio: under / v.length,
    cleanRatio: (v.length - over - under) / v.length,
    avgCorrections: corr / v.length,
  };
}
