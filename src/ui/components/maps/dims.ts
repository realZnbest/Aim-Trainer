import type { Scenario } from '@/scenarios/schema';

/** Movement clamp from engine/simulation (linear / sine / strafe-ai). */
const MOVE_X = 9;
const MOVE_Y = 6;

export interface ArenaDims {
  effX: number;
  effY: number;
  minD: number;
  maxD: number;
  floorY: number;
  ceilY: number;
  sideX: number;
  frontZ: number;
  backZ: number;
  wallW: number;
  wallH: number;
  wallD: number;
  centerZ: number;
}

export function computeDims(s: Scenario): ArenaDims {
  const area = s.spawnArea;
  const minD = Math.min(area.minDistance, area.maxDistance);
  const maxD = Math.max(area.minDistance, area.maxDistance);
  const maxR = Math.max(s.targetSize, s.targetSizeMax, 0.3);

  let needX: number;
  let needY: number;
  if (area.volume === 'box') {
    needX = area.halfExtents?.x ?? 6;
    needY = area.halfExtents?.y ?? 4;
  } else if (area.volume === 'sphere') {
    needX = area.radius ?? 5;
    needY = area.radius ?? 5;
  } else {
    const halfRad = ((area.coneHalfAngleDeg ?? 14) * Math.PI) / 180;
    const r = Math.tan(halfRad) * maxD;
    needX = r;
    needY = r;
  }

  // Clear zone: spawn reach + movement drift + target radius.
  const effX = Math.max(needX + maxR, MOVE_X + maxR);
  const effY = Math.max(needY + maxR, MOVE_Y + maxR);

  const floorY = -(effY + 3);
  const ceilY = effY + 4;
  const sideX = effX + 9;
  const frontZ = -(maxD + 9);
  const backZ = 18;
  const wallW = sideX * 2 + 16;
  const wallH = ceilY - floorY;
  const wallD = backZ - frontZ;
  return {
    effX,
    effY,
    minD,
    maxD,
    floorY,
    ceilY,
    sideX,
    frontZ,
    backZ,
    wallW,
    wallH,
    wallD,
    centerZ: (backZ + frontZ) / 2,
  };
}
