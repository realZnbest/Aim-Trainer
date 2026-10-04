import { useMemo, type ReactElement } from 'react';
import type { ArenaTheme } from '../../arenaThemes';
import type { ArenaDims } from './dims';
import { useSurfaces, zSlots } from './shared';

/** Warm / cool accents live only off the target lane (sides, ceiling, behind). */
const TEAL = '#14b8a6';
const OLIVE = '#5a6148';
const RUST = '#7a4a2b';

/** Night range: the original enclosed training hall (corridor, pillars, ceiling beams). */
export function RangeMap({ d, theme }: { d: ArenaDims; theme: ArenaTheme }): ReactElement {
  const { floorMap, sideMap, endMap } = useSurfaces(theme, d);
  const layout = useMemo(() => {
    const pillarZs = zSlots(d.backZ, d.frontZ, 10, 5, 14);
    const beamZs = zSlots(d.backZ, d.frontZ, 10, 6, 12);
    const strapZs = zSlots(d.backZ, d.frontZ, 12, 8, 10);

    const midY = (d.floorY + d.ceilY) / 2;
    const wide = d.sideX > 22;
    const fixtureXs = wide ? [0, d.sideX - 6, -(d.sideX - 6)] : [0];
    const gridSize = Math.ceil(Math.max(d.wallW + 14, d.wallD + 14));
    const cell = gridSize > 160 ? 4 : 2;
    const gridDiv = Math.max(8, Math.min(120, Math.floor(gridSize / cell)));
    return { pillarZs, beamZs, strapZs, midY, fixtureXs, gridSize, gridDiv };
  }, [d]);

  const sx = d.sideX;
  const wallInnerL = -sx + 0.4;
  const wallInnerR = sx - 0.4;
  const ductLen = d.wallD - 8;
  const beamLen = sx * 2 - 0.6;
  const crateX = sx - 3.4;

  return (
    <group>
      {/* ---------- floor: bare slab + survey grid (crates are the sole floor props) ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[d.wallW + 14, d.wallD + 14]} />
        <meshStandardMaterial
          color={floorMap ? '#ffffff' : theme.floor}
          map={floorMap}
          roughness={0.5}
          metalness={0.3}
          envMapIntensity={0.9}
        />
      </mesh>
      <gridHelper
        args={[layout.gridSize, layout.gridDiv, theme.gridMajor, theme.gridMinor]}
        position={[0, d.floorY + 0.02, d.centerZ]}
      />

      {/* ---------- front (target) wall: intentionally bare — zero distraction behind targets ---------- */}
      <mesh position={[0, layout.midY, d.frontZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color={theme.front} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* ---------- side walls + mounted dressing ---------- */}
      <mesh position={[-sx, layout.midY, d.centerZ]}>
        <boxGeometry args={[0.8, d.wallH, d.wallD]} />
        <meshStandardMaterial
          color={sideMap ? '#ffffff' : theme.wall}
          map={sideMap}
          roughness={0.85}
          metalness={0.12}
        />
      </mesh>
      <mesh position={[sx, layout.midY, d.centerZ]}>
        <boxGeometry args={[0.8, d.wallH, d.wallD]} />
        <meshStandardMaterial
          color={sideMap ? '#ffffff' : theme.wall}
          map={sideMap}
          roughness={0.85}
          metalness={0.12}
        />
      </mesh>
      {/* base glow strips run along the wall bases */}
      <mesh position={[wallInnerL + 0.05, d.floorY + 0.65, d.centerZ]}>
        <boxGeometry args={[0.1, 0.16, d.wallD - 6]} />
        <meshBasicMaterial color={theme.strip} toneMapped={false} />
      </mesh>
      <mesh position={[wallInnerR - 0.05, d.floorY + 0.65, d.centerZ]}>
        <boxGeometry args={[0.1, 0.16, d.wallD - 6]} />
        <meshBasicMaterial color={theme.strip} toneMapped={false} />
      </mesh>
      {/* a single amber accent stripe per side wall */}
      <mesh position={[wallInnerL + 0.05, 5.6, d.centerZ]}>
        <boxGeometry args={[0.1, 0.18, d.wallD - 6]} />
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </mesh>
      <mesh position={[wallInnerR - 0.05, 5.6, d.centerZ]}>
        <boxGeometry args={[0.1, 0.18, d.wallD - 6]} />
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </mesh>
      {/* ventilation ducts hugging the upper walls + straps tying them to the ceiling */}
      {[-1, 1].map((side, si) => (
        <mesh key={300 + si} position={[side * (sx - 0.9), d.ceilY - 1.6, d.centerZ]}>
          <boxGeometry args={[1.0, 1.0, ductLen]} />
          <meshStandardMaterial color={theme.metal} roughness={0.55} metalness={0.5} />
        </mesh>
      ))}
      {layout.strapZs.flatMap((z, zi) =>
        [-1, 1].map((side, si) => (
          <mesh key={3000 + zi * 2 + si} position={[side * (sx - 0.9), d.ceilY - 0.55, z]}>
            <boxGeometry args={[0.18, 1.1, 0.5]} />
            <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.5} />
          </mesh>
        )),
      )}
      {/* amber bands ringing the ducts */}
      {layout.strapZs.flatMap((z, zi) =>
        [-1, 1].map((side, si) => (
          <mesh key={8000 + zi * 2 + si} position={[side * (sx - 0.9), d.ceilY - 1.6, z]}>
            <boxGeometry args={[1.06, 1.06, 0.24]} />
            <meshBasicMaterial color={theme.accent} toneMapped={false} />
          </mesh>
        )),
      )}

      {/* ---------- free-standing columns: floor-to-ceiling, outside the lane ---------- */}
      {layout.pillarZs.flatMap((z, zi) =>
        [-1, 1].map((side, si) => (
          <group key={4000 + zi * 2 + si}>
            <mesh position={[side * (sx - 1.7), layout.midY, z]}>
              <boxGeometry args={[1.2, d.wallH, 1.2]} />
              <meshStandardMaterial color={theme.pillar} roughness={0.8} metalness={0.15} />
            </mesh>
            <mesh position={[side * (sx - 2.36), layout.midY, z]}>
              <boxGeometry args={[0.12, d.wallH - 3, 0.12]} />
              <meshBasicMaterial color={theme.edge} toneMapped={false} />
            </mesh>
            {/* signal-red collar below the ceiling + grounded plinth */}
            <mesh position={[side * (sx - 1.7), d.ceilY - 0.7, z]}>
              <boxGeometry args={[1.34, 0.2, 1.34]} />
              <meshBasicMaterial color={theme.accent} toneMapped={false} />
            </mesh>
            <mesh position={[side * (sx - 1.7), d.floorY + 0.25, z]}>
              <boxGeometry args={[1.5, 0.5, 1.5]} />
              <meshStandardMaterial color={theme.metalDark} roughness={0.7} metalness={0.3} />
            </mesh>
          </group>
        )),
      )}

      {/* ---------- ceiling: slab + wall-to-wall beams + mounted lamp panels ---------- */}
      <mesh position={[0, d.ceilY + 0.4, d.centerZ]}>
        <boxGeometry args={[d.wallW, 0.8, d.wallD]} />
        <meshStandardMaterial color={theme.ceiling} roughness={0.95} metalness={0.05} />
      </mesh>
      {layout.beamZs.map((z, bi) => (
        <group key={5000 + bi}>
          <mesh position={[0, d.ceilY - 0.35, z]}>
            <boxGeometry args={[beamLen, 0.7, 1.0]} />
            <meshStandardMaterial color={theme.beam} roughness={0.8} metalness={0.2} />
          </mesh>
          {layout.fixtureXs.map((x, fi) => (
            <group key={6000 + bi * 8 + fi}>
              <mesh position={[x, d.ceilY - 0.77, z]}>
                <boxGeometry args={[3.4, 0.14, 1.6]} />
                <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.4} />
              </mesh>
              <mesh position={[x, d.ceilY - 0.89, z]}>
                <boxGeometry args={[3.0, 0.1, 1.3]} />
                <meshBasicMaterial color={theme.lamp} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* ---------- back wall (behind the player): door + exit sign ---------- */}
      <mesh position={[0, layout.midY, d.backZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial
          color={endMap ? '#ffffff' : theme.wall}
          map={endMap}
          roughness={0.85}
          metalness={0.12}
        />
      </mesh>
      <mesh position={[0, d.floorY + 2.2, d.backZ - 0.49]}>
        <boxGeometry args={[2.6, 4.4, 0.18]} />
        <meshStandardMaterial color="#060b18" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[-1.42, d.floorY + 2.3, d.backZ - 0.49]}>
        <boxGeometry args={[0.25, 4.6, 0.25]} />
        <meshStandardMaterial color={theme.metal} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[1.42, d.floorY + 2.3, d.backZ - 0.49]}>
        <boxGeometry args={[0.25, 4.6, 0.25]} />
        <meshStandardMaterial color={theme.metal} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, d.floorY + 4.72, d.backZ - 0.49]}>
        <boxGeometry args={[3.1, 0.3, 0.25]} />
        <meshStandardMaterial color={theme.metal} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, d.floorY + 5.15, d.backZ - 0.46]}>
        <boxGeometry args={[1.3, 0.3, 0.12]} />
        <meshBasicMaterial color="#38e08a" toneMapped={false} />
      </mesh>
      {/* teal header bar above the door (wall-mounted) */}
      <mesh position={[0, d.floorY + 6.2, d.backZ - 0.46]}>
        <boxGeometry args={[2.2, 0.22, 0.12]} />
        <meshBasicMaterial color={TEAL} toneMapped={false} />
      </mesh>

      {/* crates: the sole floor props, grounded behind / beside the player only */}
      {[
        { x: crateX, z: d.backZ - 3, y: 0, c: '#1a2c52' },
        { x: -crateX, z: d.backZ - 3, y: 0, c: OLIVE },
        { x: crateX, z: d.backZ - 3, y: 1, c: '#22365e' },
        { x: crateX - 1.5, z: d.backZ - 2.8, y: 0, c: RUST },
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
