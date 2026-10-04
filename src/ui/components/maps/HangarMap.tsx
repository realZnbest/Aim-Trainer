import { useEffect, useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import type { ArenaTheme } from '../../arenaThemes';
import type { ArenaDims } from './dims';
import { Instances, lcg, useCanvasTexture, zSlots, type InstanceItem } from './shared';

const CONTAINER_COLORS = ['#8a3b2b', '#2f5d7c', '#c08a2e', '#4a6b45', '#6b6f78', '#7a4a2b'];

/**
 * Hangar: vaulted roof on arched trusses, gantry catwalks, stacked cargo containers,
 * wet reflective concrete and lamp light shafts. Every prop stays at |x| >= effX + 3
 * (sides only); the front wall behind the targets is bare dark steel.
 */
export function HangarMap({ d, theme }: { d: ArenaDims; theme: ArenaTheme }): ReactElement {
  const sx = d.sideX;
  const springY = d.floorY + d.wallH * 0.5;
  const ry = d.ceilY - springY;
  const bodyH = springY - d.floorY;
  const bodyMidY = (springY + d.floorY) / 2;
  const deckY = d.floorY + 7;
  const wallLen = d.wallD - 8;

  const layout = useMemo(() => {
    const archZs = zSlots(d.backZ, d.frontZ, 12, 6, 14);
    const lampZs = zSlots(d.backZ, d.frontZ, 10, 6, 16);
    const ribs: InstanceItem[] = [];
    for (let z = d.frontZ + 2; z < d.backZ - 2; z += 1.8) {
      for (const side of [-1, 1]) {
        ribs.push({ p: [side * (sx - 0.55), bodyMidY, z], s: [0.3, bodyH - 0.2, 0.5] });
      }
    }
    const posts: InstanceItem[] = [];
    for (let z = d.frontZ + 4; z < d.backZ - 4; z += 3) {
      for (const side of [-1, 1]) {
        posts.push({ p: [side * (sx - 3.5), deckY + 0.65, z], s: [0.08, 1.1, 0.08] });
      }
    }
    const legs: InstanceItem[] = [];
    for (let z = d.frontZ + 6; z < d.backZ - 4; z += 12) {
      for (const side of [-1, 1]) {
        legs.push({
          p: [side * (sx - 2.2), (deckY + d.floorY) / 2, z],
          s: [0.35, deckY - d.floorY, 0.35],
        });
      }
    }
    const rnd = lcg(11);
    const containers: InstanceItem[] = [];
    for (let z = d.backZ - 7; z > d.frontZ + 7; z -= 7.2) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.25) continue;
        const tint = CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)] ?? '#6b6f78';
        containers.push({ p: [side * (sx - 3.6), d.floorY + 1.3, z], s: [2.5, 2.6, 6], c: tint });
        if (rnd() < 0.55) {
          const tint2 = CONTAINER_COLORS[Math.floor(rnd() * CONTAINER_COLORS.length)] ?? '#6b6f78';
          containers.push({
            p: [side * (sx - 3.6), d.floorY + 3.9, z],
            s: [2.5, 2.6, 6],
            c: tint2,
          });
        }
      }
    }
    const dashes: InstanceItem[] = [];
    for (let z = d.backZ - 6; z > d.frontZ + 6; z -= 5) {
      for (const side of [-1, 1]) {
        dashes.push({ p: [side * (d.effX + 2.4), d.floorY + 0.03, z], s: [0.3, 0.02, 2.6] });
      }
    }
    return { archZs, lampZs, ribs, posts, legs, containers, dashes };
  }, [d, sx, bodyMidY, bodyH, deckY]);

  const archGeom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (Math.PI * i) / 40;
      pts.push(new THREE.Vector3(Math.cos(a) * (sx - 0.45), springY + Math.sin(a) * (ry - 0.2), 0));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.26, 6);
  }, [sx, springY, ry]);
  useEffect(() => () => archGeom.dispose(), [archGeom]);

  const ribTex = useCanvasTexture('container-ribs', 128, 128, (g, w, h) => {
    g.fillStyle = '#d9d9d9';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.10)';
      g.fillRect((i * w) / 16, 0, w / 16, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
  });
  const hazardTex = useCanvasTexture(
    'hazard',
    256,
    32,
    (g, w, h) => {
      g.fillStyle = '#f2b01e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#15171c';
      for (let x = -h; x < w + h; x += 48) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 24, h);
        g.lineTo(x + 24 + h, 0);
        g.lineTo(x + h, 0);
        g.closePath();
        g.fill();
      }
    },
    [wallLen / 6, 1],
  );

  const wallW = d.wallW;
  const lampY = d.ceilY - 1.8;

  return (
    <group>
      {/* ---------- wet concrete: planar reflection, dimmed + blurred ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[wallW + 14, d.wallD + 14]} />
        <MeshReflectorMaterial
          color="#0d0f14"
          blur={[260, 80]}
          resolution={512}
          mixBlur={1}
          mixStrength={22}
          roughness={0.85}
          metalness={0.5}
          depthScale={0.8}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          mirror={0.55}
        />
      </mesh>
      <Instances items={layout.dashes}>
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </Instances>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (d.effX + 2.4), d.floorY + 0.03, d.centerZ]}>
          <boxGeometry args={[0.18, 0.02, d.wallD - 6]} />
          <meshBasicMaterial color={theme.strip} toneMapped={false} />
        </mesh>
      ))}

      {/* ---------- shell: bare front wall, plinth + ribbed side walls, vaulted roof ---------- */}
      <mesh position={[0, (d.floorY + d.ceilY) / 2, d.frontZ]}>
        <boxGeometry args={[wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color={theme.front} roughness={0.9} metalness={0.15} />
      </mesh>
      <mesh position={[0, (d.floorY + d.ceilY) / 2, d.backZ]}>
        <boxGeometry args={[wallW, d.wallH, 0.8]} />
        <meshStandardMaterial color={theme.wall} roughness={0.85} metalness={0.2} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * sx, bodyMidY, d.centerZ]}>
            <boxGeometry args={[0.8, bodyH, d.wallD]} />
            <meshStandardMaterial color={theme.wall} roughness={0.75} metalness={0.35} />
          </mesh>
          <mesh position={[side * (sx - 0.8), d.floorY + 1.2, d.centerZ]}>
            <boxGeometry args={[1.2, 2.4, d.wallD - 2]} />
            <meshStandardMaterial color={theme.metal} roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[side * (sx - 1.35), d.floorY + 2.5, d.centerZ]}>
            <boxGeometry args={[0.1, 0.2, d.wallD - 2]} />
            <meshBasicMaterial color={theme.accent} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Instances items={layout.ribs}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.5} metalness={0.7} />
      </Instances>
      <mesh
        position={[0, springY, d.centerZ]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[sx, d.wallD, ry]}
      >
        <cylinderGeometry args={[1, 1, 1, 48, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial
          color={theme.ceiling}
          roughness={0.6}
          metalness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      {layout.archZs.map((z) => (
        <mesh key={z} geometry={archGeom} position={[0, 0, z]}>
          <meshStandardMaterial color={theme.metal} roughness={0.45} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, d.ceilY - 0.2, d.centerZ]}>
        <boxGeometry args={[0.35, 0.35, d.wallD - 1]} />
        <meshStandardMaterial color={theme.metal} roughness={0.5} metalness={0.7} />
      </mesh>

      {/* ---------- gantry catwalks (sides only, above the containers) ---------- */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (sx - 2.2), deckY, d.centerZ]}>
            <boxGeometry args={[2.6, 0.2, wallLen]} />
            <meshStandardMaterial color={theme.metalDark} roughness={0.55} metalness={0.7} />
          </mesh>
          <mesh position={[side * (sx - 3.5), deckY + 1.15, d.centerZ]}>
            <boxGeometry args={[0.1, 0.1, wallLen]} />
            <meshStandardMaterial color={theme.metal} roughness={0.4} metalness={0.8} />
          </mesh>
          <mesh position={[side * (sx - 3.45), deckY - 0.14, d.centerZ]}>
            <boxGeometry args={[0.08, 0.06, wallLen]} />
            <meshBasicMaterial color={theme.strip} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Instances items={layout.posts}>
        <meshStandardMaterial color={theme.metal} roughness={0.4} metalness={0.8} />
      </Instances>
      <Instances items={layout.legs}>
        <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.6} />
      </Instances>

      {/* ---------- cargo containers ---------- */}
      <Instances items={layout.containers}>
        <meshStandardMaterial
          color="#ffffff"
          map={ribTex}
          roughness={0.65}
          metalness={0.35}
          envMapIntensity={0.8}
        />
      </Instances>

      {/* ---------- lamps + light shafts ---------- */}
      <Instances
        shape="cone"
        items={[0, -(sx - 6), sx - 6].flatMap((x) =>
          layout.lampZs.map((z): InstanceItem => ({
            p: [x, d.ceilY - 1.4, z],
            s: [1.1, 0.7, 1.1],
          })),
        )}
      >
        <meshStandardMaterial color={theme.metalDark} roughness={0.5} metalness={0.7} />
      </Instances>
      <Instances
        items={[0, -(sx - 6), sx - 6].flatMap((x) =>
          layout.lampZs.map((z): InstanceItem => ({ p: [x, lampY, z], s: [1.6, 0.08, 1.6] })),
        )}
      >
        <meshBasicMaterial color={theme.lamp} toneMapped={false} />
      </Instances>
      <Instances
        shape="cone"
        items={[-(sx - 6), sx - 6].flatMap((x) =>
          layout.lampZs.map((z): InstanceItem => ({ p: [x, lampY - 7, z], s: [3.6, 14, 3.6] })),
        )}
      >
        <meshBasicMaterial
          color={theme.lamp}
          transparent
          opacity={0.032}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </Instances>
      {[-1, 1].flatMap((side) =>
        [0.25, 0.7].map((t) => (
          <pointLight
            key={`${String(side)}-${String(t)}`}
            position={[side * (sx - 6), springY - 1, d.backZ - t * d.wallD]}
            color={theme.lamp}
            intensity={90}
            distance={46}
            decay={2}
          />
        )),
      )}

      {/* ---------- hangar door behind the player ---------- */}
      <mesh position={[0, d.floorY + 6, d.backZ - 0.5]}>
        <boxGeometry args={[14, 12, 0.3]} />
        <meshStandardMaterial color={theme.metalDark} roughness={0.6} metalness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 7.2, d.floorY + 6, d.backZ - 0.6]}>
          <boxGeometry args={[0.5, 12.6, 0.4]} />
          <meshStandardMaterial color={theme.metal} roughness={0.5} metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, d.floorY + 12.4, d.backZ - 0.6]}>
        <boxGeometry args={[14.9, 0.5, 0.4]} />
        <meshStandardMaterial color={theme.metal} roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh position={[0, d.floorY + 0.7, d.backZ - 0.68]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[14, 1.2]} />
        <meshBasicMaterial map={hazardTex} toneMapped={false} />
      </mesh>
    </group>
  );
}
