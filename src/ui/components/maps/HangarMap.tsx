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
export function HangarMap({
  d,
  theme,
  reflections,
}: {
  d: ArenaDims;
  theme: ArenaTheme;
  reflections: boolean;
}): ReactElement {
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
    // longitudinal purlins along the vault, wall pipe runs, skylight panels
    const purlins: InstanceItem[] = [];
    const rx = sx - 0.45;
    const ryy = ry - 0.2;
    for (const deg of [25, 50, 75, 105, 130, 155]) {
      const a = (deg * Math.PI) / 180;
      purlins.push({
        p: [Math.cos(a) * rx, springY + Math.sin(a) * ryy, d.centerZ],
        s: [0.11, d.wallD - 4, 0.11],
        r: [Math.PI / 2, 0, 0],
      });
    }
    const pipes: InstanceItem[] = [];
    for (const side of [-1, 1]) {
      pipes.push({
        p: [side * (sx - 0.62), d.floorY + 3.4, d.centerZ],
        s: [0.18, d.wallD - 6, 0.18],
        r: [Math.PI / 2, 0, 0],
      });
      pipes.push({
        p: [side * (sx - 0.62), d.floorY + 3.9, d.centerZ],
        s: [0.11, d.wallD - 6, 0.11],
        r: [Math.PI / 2, 0, 0],
      });
    }
    const skylights: InstanceItem[] = [];
    const skyX = 5.5;
    const skyY = springY + Math.sqrt(Math.max(0, 1 - (skyX / rx) ** 2)) * ryy - 0.12;
    for (let i = 0; i < archZs.length - 1; i++) {
      const z = ((archZs[i] ?? 0) + (archZs[i + 1] ?? 0)) / 2;
      for (const side of [-1, 1]) {
        skylights.push({ p: [side * skyX, skyY, z], s: [2.2, 0.1, 5], r: [0, 0, -side * 0.5] });
      }
    }
    const signs: InstanceItem[] = [];
    for (let z = d.frontZ + 14; z < d.backZ - 8; z += 26) {
      for (const side of [-1, 1]) {
        signs.push({ p: [side * (sx - 0.4), d.floorY + 9.6, z], s: [0.08, 1.3, 2.6] });
      }
    }
    const arrows: InstanceItem[] = [];
    for (let z = d.backZ - 8; z > d.frontZ + 8; z -= 9) {
      for (const side of [-1, 1]) {
        arrows.push({ p: [side * (d.effX + 3.3), d.floorY + 0.034, z], s: [1.4, 0.004, 2.2] });
      }
    }
    const rndo = lcg(41);
    const stains: InstanceItem[] = [];
    for (let i = 0; i < 9; i++) {
      const side = rndo() > 0.5 ? 1 : -1;
      stains.push({
        p: [
          side * (d.effX + 1 + rndo() * 6),
          d.floorY + 0.036,
          d.frontZ + 6 + rndo() * (d.wallD - 16),
        ],
        s: [2 + rndo() * 3, 0.004, 1.6 + rndo() * 2.6],
        ry: rndo() * Math.PI,
      });
    }
    return {
      archZs,
      lampZs,
      ribs,
      posts,
      legs,
      containers,
      dashes,
      purlins,
      pipes,
      skylights,
      signs,
      arrows,
      stains,
    };
  }, [d, sx, bodyMidY, bodyH, deckY, ry, springY]);

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

  const poolTex = useCanvasTexture('light-pool', 128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, w, h);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const arrowTex = useCanvasTexture('floor-arrow', 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f2b01e';
    g.globalAlpha = 0.8;
    for (const y of [60, 140]) {
      g.beginPath();
      g.moveTo(w / 2, y - 40);
      g.lineTo(w - 14, y + 20);
      g.lineTo(w - 42, y + 20);
      g.lineTo(w / 2, y - 8);
      g.lineTo(42, y + 20);
      g.lineTo(14, y + 20);
      g.closePath();
      g.fill();
    }
  });
  const stainTex = useCanvasTexture('oil-stain', 128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.8)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.clearRect(0, 0, w, h);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const signTex = useCanvasTexture('hangar-sign', 256, 112, (g, w, h) => {
    g.fillStyle = '#f2b01e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#15171c';
    g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f2b01e';
    g.font = '700 54px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BAY 03', w / 2, h / 2 + 3);
  });
  // Light shafts fade out toward the floor instead of ending in a hard cone edge.
  const shaftFade = useCanvasTexture('shaft-fade', 4, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#555555');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const wallW = d.wallW;
  const lampY = d.ceilY - 1.8;

  return (
    <group>
      {/* ---------- wet concrete: planar reflection, dimmed + blurred ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[wallW + 14, d.wallD + 14]} />
        {reflections ? (
          <MeshReflectorMaterial
            color="#0d0f14"
            blur={[260, 80]}
            resolution={256}
            mixBlur={1}
            mixStrength={22}
            roughness={0.85}
            metalness={0.5}
            depthScale={0.8}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            mirror={0.55}
          />
        ) : (
          <meshStandardMaterial color="#10131a" roughness={0.55} metalness={0.5} />
        )}
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

      {/* ---------- vault detail: purlins, skylights, wall pipes, signage ---------- */}
      <Instances shape="cylinder" items={layout.purlins}>
        <meshStandardMaterial color={theme.metal} roughness={0.4} metalness={0.8} />
      </Instances>
      <Instances items={layout.skylights}>
        <meshBasicMaterial color="#7fa6e8" toneMapped={false} />
      </Instances>
      <Instances shape="cylinder" items={layout.pipes}>
        <meshStandardMaterial color={theme.metal} roughness={0.35} metalness={0.85} />
      </Instances>
      <Instances items={layout.signs}>
        <meshBasicMaterial map={signTex} toneMapped={false} />
      </Instances>

      {/* ---------- floor decals: lane arrows + oil stains ---------- */}
      <Instances items={layout.arrows}>
        <meshBasicMaterial map={arrowTex} transparent depthWrite={false} toneMapped={false} />
      </Instances>
      <Instances items={layout.stains}>
        <meshBasicMaterial map={stainTex} transparent depthWrite={false} />
      </Instances>

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
          alphaMap={shaftFade}
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </Instances>
      {/* Baked-look light pools under the side lamps (additive decals; no real-time lights). */}
      <Instances
        items={[-(sx - 6), sx - 6].flatMap((x) =>
          layout.lampZs.map((z): InstanceItem => ({
            p: [x, d.floorY + 0.05, z],
            s: [9, 0.01, 9],
            r: [0, 0, 0],
          })),
        )}
      >
        <meshBasicMaterial
          map={poolTex}
          color={theme.lamp}
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </Instances>

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
