import { useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import type { ArenaTheme } from '../../arenaThemes';
import type { ArenaDims } from './dims';
import {
  Instances,
  surfaceProps,
  useCanvasTexture,
  useSurfaces,
  zSlots,
  type InstanceItem,
} from './shared';

const TEAL = '#14b8a6';
const OLIVE = '#5a6148';
const RUST = '#7a4a2b';

/** Painted distance marker on the floor beside the lane (decal, flat on the slab). */
function FloorMarker({
  label,
  x,
  z,
  y,
  color,
}: {
  label: string;
  x: number;
  z: number;
  y: number;
  color: string;
}): ReactElement {
  const tex = useCanvasTexture(`marker-${label}-${color}`, 256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.globalAlpha = 0.85;
    g.font = '700 84px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 + 4);
    g.fillRect(8, h - 10, w - 16, 5);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y + 0.025, z]}>
      <planeGeometry args={[3.2, 1.6]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/**
 * Night range: the enclosed training hall. All repeated parts (pillars, beams, lamps, straps,
 * pipes, floor lights) are single-draw `Instances`; surfaces carry normal + roughness maps.
 * Props stay outside the clear zone; the front wall behind the targets is bare.
 */
export function RangeMap({ d, theme }: { d: ArenaDims; theme: ArenaTheme }): ReactElement {
  const surfaces = useSurfaces(theme, d);
  const sx = d.sideX;
  const midY = (d.floorY + d.ceilY) / 2;
  const wallInnerL = -sx + 0.4;
  const wallInnerR = sx - 0.4;
  const crateX = sx - 3.4;

  const L = useMemo(() => {
    const pillarZs = zSlots(d.backZ, d.frontZ, 10, 5, 14);
    const beamZs = zSlots(d.backZ, d.frontZ, 10, 6, 12);
    const strapZs = zSlots(d.backZ, d.frontZ, 12, 8, 10);
    const wide = sx > 22;
    const fixtureXs = wide ? [0, sx - 6, -(sx - 6)] : [0];
    const sides = [-1, 1] as const;

    const pillarBody: InstanceItem[] = [];
    const pillarEdge: InstanceItem[] = [];
    const collar: InstanceItem[] = [];
    const plinth: InstanceItem[] = [];
    for (const z of pillarZs) {
      for (const side of sides) {
        pillarBody.push({ p: [side * (sx - 1.7), midY, z], s: [1.2, d.wallH, 1.2] });
        pillarEdge.push({ p: [side * (sx - 2.36), midY, z], s: [0.12, d.wallH - 3, 0.12] });
        collar.push({ p: [side * (sx - 1.7), d.ceilY - 0.7, z], s: [1.34, 0.2, 1.34] });
        plinth.push({ p: [side * (sx - 1.7), d.floorY + 0.25, z], s: [1.5, 0.5, 1.5] });
      }
    }
    const beams: InstanceItem[] = beamZs.map((z) => ({
      p: [0, d.ceilY - 0.35, z],
      s: [sx * 2 - 0.6, 0.7, 1.0],
    }));
    const housings: InstanceItem[] = [];
    const lamps: InstanceItem[] = [];
    for (const z of beamZs) {
      for (const x of fixtureXs) {
        housings.push({ p: [x, d.ceilY - 0.77, z], s: [3.4, 0.14, 1.6] });
        lamps.push({ p: [x, d.ceilY - 0.89, z], s: [3.0, 0.1, 1.3] });
      }
    }
    const straps: InstanceItem[] = [];
    const bands: InstanceItem[] = [];
    for (const z of strapZs) {
      for (const side of sides) {
        straps.push({ p: [side * (sx - 0.9), d.ceilY - 0.55, z], s: [0.18, 1.1, 0.5] });
        bands.push({ p: [side * (sx - 0.9), d.ceilY - 1.6, z], s: [1.06, 1.06, 0.24] });
      }
    }
    // pipe runs + cable trays on the side walls (horizontal, along z)
    const pipes: InstanceItem[] = [];
    const trays: InstanceItem[] = [];
    const len = d.wallD - 6;
    for (const side of sides) {
      const x = side * (sx - 0.62);
      pipes.push({
        p: [x, d.floorY + 3.1, d.centerZ],
        s: [0.16, len, 0.16],
        r: [Math.PI / 2, 0, 0],
      });
      pipes.push({
        p: [x, d.floorY + 3.55, d.centerZ],
        s: [0.1, len, 0.1],
        r: [Math.PI / 2, 0, 0],
      });
      trays.push({ p: [side * (sx - 0.55), d.floorY + 8.4, d.centerZ], s: [0.5, 0.12, len] });
    }
    // pipe clamps between pillars
    const clamps: InstanceItem[] = [];
    for (let z = d.frontZ + 6; z < d.backZ - 4; z += 6) {
      for (const side of sides) {
        clamps.push({ p: [side * (sx - 0.62), d.floorY + 3.32, z], s: [0.26, 0.9, 0.26] });
      }
    }
    // wall status panels (dim emissive readouts) between pillars
    const panels: InstanceItem[] = [];
    for (let i = 0; i < pillarZs.length - 1; i++) {
      const z = ((pillarZs[i] ?? 0) + (pillarZs[i + 1] ?? 0)) / 2;
      for (const side of sides) {
        panels.push({ p: [side * (sx - 0.5), d.floorY + 5.2, z], s: [0.1, 1.2, 2.6] });
      }
    }
    // floor inset lights flanking the lane (outside the clear zone)
    const floorLights: InstanceItem[] = [];
    for (let z = d.backZ - 4; z > d.frontZ + 4; z -= 3) {
      for (const side of sides) {
        floorLights.push({ p: [side * (d.effX + 0.9), d.floorY + 0.04, z], s: [0.35, 0.06, 0.9] });
      }
    }
    const crates = [
      { x: crateX, z: d.backZ - 3, y: 0, c: '#1a2c52' },
      { x: -crateX, z: d.backZ - 3, y: 0, c: OLIVE },
      { x: crateX, z: d.backZ - 3, y: 1, c: '#22365e' },
      { x: crateX - 1.5, z: d.backZ - 2.8, y: 0, c: RUST },
      { x: -crateX + 2.2, z: d.backZ - 5.5, y: 0, c: '#22365e' },
    ].map((b): InstanceItem => ({
      p: [b.x, d.floorY + 0.65 + b.y * 1.3, b.z],
      s: [1.3, 1.3, 1.3],
      c: b.c,
    }));
    const markerZs: number[] = [];
    for (let m = 10; m <= d.maxD + 0.5 && markerZs.length < 5; m += 10) markerZs.push(m);
    return {
      pillarBody,
      pillarEdge,
      collar,
      plinth,
      beams,
      housings,
      lamps,
      straps,
      bands,
      pipes,
      trays,
      clamps,
      panels,
      floorLights,
      crates,
      markerZs,
    };
  }, [d, sx, midY, crateX]);

  const readout = useCanvasTexture('range-readout', 128, 64, (g, w, h) => {
    g.fillStyle = '#071326';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#4c8dff';
    for (let i = 0; i < 6; i++) {
      g.globalAlpha = 0.35 + (i % 3) * 0.2;
      g.fillRect(8, 8 + i * 9, 20 + ((i * 37) % 80), 4);
    }
  });
  const ductLen = d.wallD - 8;
  const gridSize = Math.ceil(Math.max(d.wallW + 14, d.wallD + 14));
  const gridDiv = Math.max(8, Math.min(120, Math.floor(gridSize / (gridSize > 160 ? 4 : 2))));
  const baseGlow = new THREE.Color(theme.strip);

  return (
    <group>
      {/* ---------- floor: PBR tiles + survey grid + lane markers ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[d.wallW + 14, d.wallD + 14]} />
        <meshStandardMaterial
          {...surfaceProps(surfaces.floor, theme.floor, 0.9)}
          metalness={0.3}
          envMapIntensity={0.9}
        />
      </mesh>
      <gridHelper
        args={[gridSize, gridDiv, theme.gridMajor, theme.gridMinor]}
        position={[0, d.floorY + 0.02, d.centerZ]}
      />
      {L.markerZs.map((m) =>
        [-1, 1].map((side) => (
          <FloorMarker
            key={`${String(m)}${String(side)}`}
            label={`${String(m)} M`}
            x={side * (d.effX + 2.6)}
            z={-m}
            y={d.floorY}
            color={theme.edge}
          />
        )),
      )}
      <Instances items={L.floorLights}>
        <meshBasicMaterial color={theme.edge} toneMapped={false} />
      </Instances>

      {/* ---------- front (target) wall: intentionally bare ---------- */}
      <mesh position={[0, midY, d.frontZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color={theme.front} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* ---------- side walls ---------- */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * sx, midY, d.centerZ]}>
          <boxGeometry args={[0.8, d.wallH, d.wallD]} />
          <meshStandardMaterial {...surfaceProps(surfaces.side, theme.wall, 1)} metalness={0.12} />
        </mesh>
      ))}
      {[wallInnerL, wallInnerR].map((x, i) => (
        <group key={x}>
          <mesh position={[x + (i === 0 ? 0.05 : -0.05), d.floorY + 0.65, d.centerZ]}>
            <boxGeometry args={[0.1, 0.16, d.wallD - 6]} />
            <meshBasicMaterial color={baseGlow} toneMapped={false} />
          </mesh>
          <mesh position={[x + (i === 0 ? 0.05 : -0.05), 5.6, d.centerZ]}>
            <boxGeometry args={[0.1, 0.18, d.wallD - 6]} />
            <meshBasicMaterial color={theme.accent} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Instances shape="cylinder" items={L.pipes}>
        <meshStandardMaterial color={theme.metal} roughness={0.35} metalness={0.85} />
      </Instances>
      <Instances items={L.clamps}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.5} metalness={0.7} />
      </Instances>
      <Instances items={L.trays}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.55} metalness={0.7} />
      </Instances>
      <Instances items={L.panels}>
        <meshBasicMaterial map={readout} toneMapped={false} />
      </Instances>

      {/* ---------- ducts, straps, collars ---------- */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (sx - 0.9), d.ceilY - 1.6, d.centerZ]}>
          <boxGeometry args={[1.0, 1.0, ductLen]} />
          <meshStandardMaterial color={theme.metal} roughness={0.55} metalness={0.5} />
        </mesh>
      ))}
      <Instances items={L.straps}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.5} />
      </Instances>
      <Instances items={L.bands}>
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </Instances>

      {/* ---------- free-standing columns ---------- */}
      <Instances items={L.pillarBody}>
        <meshStandardMaterial color={theme.pillar} roughness={0.8} metalness={0.15} />
      </Instances>
      <Instances items={L.pillarEdge}>
        <meshBasicMaterial color={theme.edge} toneMapped={false} />
      </Instances>
      <Instances items={L.collar}>
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </Instances>
      <Instances items={L.plinth}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.7} metalness={0.3} />
      </Instances>

      {/* ---------- ceiling ---------- */}
      <mesh position={[0, d.ceilY + 0.4, d.centerZ]}>
        <boxGeometry args={[d.wallW, 0.8, d.wallD]} />
        <meshStandardMaterial color={theme.ceiling} roughness={0.95} metalness={0.05} />
      </mesh>
      <Instances items={L.beams}>
        <meshStandardMaterial color={theme.beam} roughness={0.8} metalness={0.2} />
      </Instances>
      <Instances items={L.housings}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.4} />
      </Instances>
      <Instances items={L.lamps}>
        <meshBasicMaterial color={theme.lamp} toneMapped={false} />
      </Instances>

      {/* ---------- back wall: door + exit sign ---------- */}
      <mesh position={[0, midY, d.backZ]}>
        <boxGeometry args={[d.wallW, d.wallH, 0.8]} />
        <meshStandardMaterial {...surfaceProps(surfaces.end, theme.wall, 1)} metalness={0.12} />
      </mesh>
      <mesh position={[0, d.floorY + 2.2, d.backZ - 0.49]}>
        <boxGeometry args={[2.6, 4.4, 0.18]} />
        <meshStandardMaterial color="#060b18" roughness={0.9} metalness={0.2} />
      </mesh>
      {[-1.42, 1.42].map((x) => (
        <mesh key={x} position={[x, d.floorY + 2.3, d.backZ - 0.49]}>
          <boxGeometry args={[0.25, 4.6, 0.25]} />
          <meshStandardMaterial color={theme.metal} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, d.floorY + 4.72, d.backZ - 0.49]}>
        <boxGeometry args={[3.1, 0.3, 0.25]} />
        <meshStandardMaterial color={theme.metal} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, d.floorY + 5.15, d.backZ - 0.46]}>
        <boxGeometry args={[1.3, 0.3, 0.12]} />
        <meshBasicMaterial color="#38e08a" toneMapped={false} />
      </mesh>
      <mesh position={[0, d.floorY + 6.2, d.backZ - 0.46]}>
        <boxGeometry args={[2.2, 0.22, 0.12]} />
        <meshBasicMaterial color={TEAL} toneMapped={false} />
      </mesh>

      {/* crates: the sole floor props, behind / beside the player only */}
      <Instances items={L.crates}>
        <meshStandardMaterial color="#ffffff" roughness={0.75} metalness={0.2} />
      </Instances>
    </group>
  );
}
