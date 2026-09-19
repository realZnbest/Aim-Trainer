/**
 * Enclosed training-hall arena for the aim range.
 *
 * Design contract (gameplay first):
 * - The lane from the camera (origin) to every possible target position is
 *   NEVER occluded. All decor lives outside the "clear zone":
 *   |x| <= effX, |y - 0| <= effY + margin, -maxD <= z <= 0, where effX/effY
 *   cover the spawn volume PLUS movement drift (|x| < 9, |y| < 6) PLUS the
 *   biggest target radius. Floor strips are flat (4-5cm) so they can't block.
 * - NOTHING floats: every mesh touches the floor, a wall, the ceiling, or
 *   another grounded mesh (wall-mounted fixtures overlap their host by
 *   construction). No particles, no debris, no floating cubes.
 * - The room is derived from the active scenario (spawn volume + distances),
 *   so the back wall always sits just behind the farthest possible target and
 *   side walls stay outside the widest possible spawn. Works for every
 *   built-in drill and for extreme sandbox configs.
 * - Target readability: the wall directly behind the spawn field is completely
 *   bare (no panels, frames, or light bars) so blue targets keep full contrast
 *   with zero visual noise. All dressing lives on the side walls / ceiling.
 * - Static geometry only (no per-frame updates) to protect frame budget.
 *
 * @module ui/components/ArenaEnvironment
 */
import { useMemo, type ReactElement } from 'react';
import type { Scenario } from '@/scenarios/schema';

/** Movement clamp from engine/simulation (linear / sine / strafe-ai). */
const MOVE_X = 9;
const MOVE_Y = 6;

const FOG_COLOR = '#0b1426';
const EDGE_BLUE = '#4c8dff';
const STRIP_BLUE = '#5c94ff';
const LAMP_WHITE = '#cfe0ff';

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

  let needX = 6;
  let needY = 4;
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
  return { effX, effY, minD, maxD, floorY, ceilY, sideX, frontZ, backZ, wallW, wallH, wallD, centerZ: (backZ + frontZ) / 2 };
}

/** Evenly spaced z slots between back and front, capped count for huge rooms. */
function zSlots(backZ: number, frontZ: number, step: number, inset: number, cap: number): number[] {
  const out: number[] = [];
  const s = backZ - frontZ > 150 ? step * 2 : step;
  for (let z = backZ - inset; z > frontZ + inset && out.length < cap; z -= s) out.push(Math.round(z * 10) / 10);
  return out;
}

export function ArenaEnvironment({ scenario }: { scenario: Scenario }): ReactElement {
  const d = useMemo(() => computeDims(scenario), [scenario]);
  const layout = useMemo(() => {
    const pillarZs = zSlots(d.backZ, d.frontZ, 10, 5, 14);
    const beamZs = zSlots(d.backZ, d.frontZ, 10, 6, 12);
    const strapZs = zSlots(d.backZ, d.frontZ, 12, 8, 10);

    const gridSize = Math.ceil(Math.max(d.wallW + 14, d.wallD + 14));
    const cell = gridSize > 160 ? 4 : 2;
    const gridDiv = Math.max(8, Math.min(120, Math.floor(gridSize / cell)));

    const midY = (d.floorY + d.ceilY) / 2;
    const laneLen = 4 - (d.frontZ + 3);
    const laneCz = (4 + d.frontZ + 3) / 2;
    const wide = d.sideX > 22;
    const fixtureXs = wide ? [0, d.sideX - 6, -(d.sideX - 6)] : [0];
    return { pillarZs, beamZs, strapZs, gridSize, gridDiv, midY, laneLen, laneCz, fixtureXs };
  }, [d]);

  const sx = d.sideX;
  const wallInnerL = -sx + 0.4;
  const wallInnerR = sx - 0.4;
  const ductLen = d.wallD - 8;
  const beamLen = sx * 2 - 0.6;
  const crateX = sx - 3.4;

  return (
    <group>
      <fog attach="fog" args={[FOG_COLOR, d.maxD + 14, d.maxD + 170]} />
      <hemisphereLight args={['#3a5a94', '#0a0f1e', 0.55]} />

      {/* ---------- floor: slab + survey grid ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[d.wallW + 14, d.wallD + 14]} />
        <meshStandardMaterial color="#0c152b" roughness={0.95} metalness={0.05} />
      </mesh>
      <gridHelper args={[layout.gridSize, layout.gridDiv, '#20355f', '#141f3a']} position={[0, d.floorY + 0.02, d.centerZ]} />

      {/* player pad: grounded disc + glow ring + short bollards */}
      <mesh position={[0, d.floorY + 0.07, 0.5]}>
        <cylinderGeometry args={[2.3, 2.45, 0.14, 40]} />
        <meshStandardMaterial color="#131f3d" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY + 0.145, 0.5]}>
        <ringGeometry args={[2.36, 2.56, 48]} />
        <meshBasicMaterial color="#2f6fed" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY + 0.145, 0.5]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#1b2c55" toneMapped={false} />
      </mesh>
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = Math.cos(a) * 3.1;
        const z = 0.5 + Math.sin(a) * 3.1;
        return (
          <group key={deg} position={[x, 0, z]}>
            <mesh position={[0, d.floorY + 0.5, 0]}>
              <cylinderGeometry args={[0.13, 0.16, 1.0, 12]} />
              <meshStandardMaterial color="#1a2a52" roughness={0.5} metalness={0.6} />
            </mesh>
            <mesh position={[0, d.floorY + 1.02, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.08, 12]} />
              <meshBasicMaterial color={STRIP_BLUE} toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* lane guide strips: flat on the floor, run with the view — never cross it */}
      <mesh position={[-2.8, d.floorY + 0.03, layout.laneCz]}>
        <boxGeometry args={[0.18, 0.05, layout.laneLen]} />
        <meshBasicMaterial color="#2456a6" toneMapped={false} />
      </mesh>
      <mesh position={[2.8, d.floorY + 0.03, layout.laneCz]}>
        <boxGeometry args={[0.18, 0.05, layout.laneLen]} />
        <meshBasicMaterial color="#2456a6" toneMapped={false} />
      </mesh>

      {/* ---------- front (target) wall: intentionally bare — zero distraction behind targets ---------- */}
      <mesh position={[0, layout.midY, d.frontZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color="#101c38" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* ---------- side walls + mounted dressing ---------- */}
      <mesh position={[-sx, layout.midY, d.centerZ]}>
        <boxGeometry args={[0.8, d.wallH, d.wallD]} />
        <meshStandardMaterial color="#0e1932" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[sx, layout.midY, d.centerZ]}>
        <boxGeometry args={[0.8, d.wallH, d.wallD]} />
        <meshStandardMaterial color="#0e1932" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* base glow strips run along the wall bases */}
      <mesh position={[wallInnerL + 0.05, d.floorY + 0.65, d.centerZ]}>
        <boxGeometry args={[0.1, 0.16, d.wallD - 6]} />
        <meshBasicMaterial color="#1f4b9e" toneMapped={false} />
      </mesh>
      <mesh position={[wallInnerR - 0.05, d.floorY + 0.65, d.centerZ]}>
        <boxGeometry args={[0.1, 0.16, d.wallD - 6]} />
        <meshBasicMaterial color="#1f4b9e" toneMapped={false} />
      </mesh>
      {/* ventilation ducts hugging the upper walls + straps tying them to the ceiling */}
      {[-1, 1].map((side, si) => (
        <mesh key={300 + si} position={[side * (sx - 0.9), d.ceilY - 1.6, d.centerZ]}>
          <boxGeometry args={[1.0, 1.0, ductLen]} />
          <meshStandardMaterial color="#1a2c52" roughness={0.55} metalness={0.5} />
        </mesh>
      ))}
      {layout.strapZs.flatMap((z, zi) =>
        [-1, 1].map((side, si) => (
          <mesh key={3000 + zi * 2 + si} position={[side * (sx - 0.9), d.ceilY - 0.55, z]}>
            <boxGeometry args={[0.18, 1.1, 0.5]} />
            <meshStandardMaterial color="#0f1c38" roughness={0.6} metalness={0.5} />
          </mesh>
        )),
      )}

      {/* ---------- free-standing columns: floor-to-ceiling, outside the lane ---------- */}
      {layout.pillarZs.flatMap((z, zi) =>
        [-1, 1].map((side, si) => (
          <group key={4000 + zi * 2 + si}>
            <mesh position={[side * (sx - 1.7), layout.midY, z]}>
              <boxGeometry args={[1.2, d.wallH, 1.2]} />
              <meshStandardMaterial color="#14234a" roughness={0.8} metalness={0.15} />
            </mesh>
            <mesh position={[side * (sx - 2.36), layout.midY, z]}>
              <boxGeometry args={[0.12, d.wallH - 3, 0.12]} />
              <meshBasicMaterial color={EDGE_BLUE} toneMapped={false} />
            </mesh>
          </group>
        )),
      )}

      {/* ---------- ceiling: slab + wall-to-wall beams + mounted lamp panels ---------- */}
      <mesh position={[0, d.ceilY + 0.4, d.centerZ]}>
        <boxGeometry args={[d.wallW, 0.8, d.wallD]} />
        <meshStandardMaterial color="#0d1730" roughness={0.95} metalness={0.05} />
      </mesh>
      {layout.beamZs.map((z, bi) => (
        <group key={5000 + bi}>
          <mesh position={[0, d.ceilY - 0.35, z]}>
            <boxGeometry args={[beamLen, 0.7, 1.0]} />
            <meshStandardMaterial color="#16264a" roughness={0.8} metalness={0.2} />
          </mesh>
          {layout.fixtureXs.map((x, fi) => (
            <group key={6000 + bi * 8 + fi}>
              <mesh position={[x, d.ceilY - 0.77, z]}>
                <boxGeometry args={[3.4, 0.14, 1.6]} />
                <meshStandardMaterial color="#0a1428" roughness={0.6} metalness={0.4} />
              </mesh>
              <mesh position={[x, d.ceilY - 0.89, z]}>
                <boxGeometry args={[3.0, 0.1, 1.3]} />
                <meshBasicMaterial color={LAMP_WHITE} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* ---------- back wall (behind the player): door + exit sign ---------- */}
      <mesh position={[0, layout.midY, d.backZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color="#0e1932" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0, d.floorY + 2.2, d.backZ - 0.49]}>
        <boxGeometry args={[2.6, 4.4, 0.18]} />
        <meshStandardMaterial color="#060b18" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[-1.42, d.floorY + 2.3, d.backZ - 0.49]}>
        <boxGeometry args={[0.25, 4.6, 0.25]} />
        <meshStandardMaterial color="#1a2c52" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[1.42, d.floorY + 2.3, d.backZ - 0.49]}>
        <boxGeometry args={[0.25, 4.6, 0.25]} />
        <meshStandardMaterial color="#1a2c52" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, d.floorY + 4.72, d.backZ - 0.49]}>
        <boxGeometry args={[3.1, 0.3, 0.25]} />
        <meshStandardMaterial color="#1a2c52" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, d.floorY + 5.15, d.backZ - 0.46]}>
        <boxGeometry args={[1.3, 0.3, 0.12]} />
        <meshBasicMaterial color="#38e08a" toneMapped={false} />
      </mesh>

      {/* benches + crates: grounded, behind / beside the player only */}
      {[-1, 1].map((side, si) => (
        <group key={400 + si} position={[side * 6.5, 0, d.backZ - 5]}>
          <mesh position={[0, d.floorY + 0.25, 0]}>
            <boxGeometry args={[3.4, 0.5, 1.0]} />
            <meshStandardMaterial color="#13203c" roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[0, d.floorY + 0.58, 0]}>
            <boxGeometry args={[3.6, 0.16, 1.15]} />
            <meshStandardMaterial color="#1c2f5c" roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      ))}
      {[
        { x: crateX, z: d.backZ - 3, y: 0, c: '#1a2c52' },
        { x: -crateX, z: d.backZ - 3, y: 0, c: '#1a2c52' },
        { x: crateX, z: d.backZ - 3, y: 1, c: '#22365e' },
        { x: crateX - 1.5, z: d.backZ - 2.8, y: 0, c: '#152647' },
        { x: -crateX + 2.2, z: d.backZ - 5.5, y: 0, c: '#22365e' },
      ].map((box, i) => (
        <mesh key={i} position={[box.x, d.floorY + 0.65 + box.y * 1.3, box.z]}>
          <boxGeometry args={[1.3, 1.3, 1.3]} />
          <meshStandardMaterial color={box.c} roughness={0.75} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}
