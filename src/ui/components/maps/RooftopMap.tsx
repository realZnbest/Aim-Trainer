import { useMemo, type ReactElement } from 'react';
import type { ArenaTheme } from '../../arenaThemes';
import type { ArenaDims } from './dims';
import { SkyDome } from './Sky';
import { Instances, lcg, useCanvasTexture, useSurfaces, type InstanceItem } from './shared';

const SUN_DIR: [number, number, number] = [-0.82, 0.07, -0.57];

/**
 * Rooftop at dusk: open shader sky, hazy skyline with lit windows, low parapets with string
 * lights, rooftop machinery. Buildings top out within ~6 deg of the horizon and sit far
 * behind the lane, so targets always read against smooth sky.
 */
export function RooftopMap({ d, theme }: { d: ArenaDims; theme: ArenaTheme }): ReactElement {
  const { floorMap, sideMap, endMap } = useSurfaces(theme, d);
  const sx = d.sideX;
  const parapetH = 1.4;
  const parapetY = d.floorY + parapetH / 2;

  const windowTex = useCanvasTexture('city-windows', 128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const rnd = lcg(21);
    const cols = 8;
    const rows = 28;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = rnd();
        if (v > 0.24) {
          g.fillStyle = 'rgba(8,6,20,0.82)';
        } else {
          g.fillStyle = v > 0.12 ? '#ffcf7a' : '#9ad0ff';
        }
        g.fillRect((c * w) / cols + 3, (r * h) / rows + 3, w / cols - 6, h / rows - 6);
      }
    }
  });
  const helipadTex = useCanvasTexture('helipad', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#e9d36a';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e9d36a';
    g.font = 'bold 150px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', w / 2, h / 2 + 8);
  });

  const scenery = useMemo(() => {
    const rnd = lcg(5);
    const city: InstanceItem[] = [];
    const palette = ['#1b1536', '#241a45', '#2d2150', '#1a1030', '#33265e'];
    for (let i = 0; i < 150; i++) {
      const theta = (rnd() * 2 - 1) * ((100 * Math.PI) / 180);
      const r = 90 + rnd() * 280;
      const w = 9 + rnd() * 20;
      const inLane = Math.abs(theta) < (42 * Math.PI) / 180;
      const tall = !inLane && r > 200 && rnd() < 0.25;
      let top = tall ? 4 + rnd() * 14 : -70 + rnd() * 62;
      // Behind the lane the skyline stays well below the horizon: smooth sky behind targets.
      if (inLane) top = Math.min(top, -r * 0.2);
      const bottom = -130;
      city.push({
        p: [r * Math.sin(theta), (top + bottom) / 2, -r * Math.cos(theta)],
        s: [w, top - bottom, w * (0.7 + rnd() * 0.6)],
        c: palette[Math.floor(rnd() * palette.length)] ?? '#1b1536',
        ry: rnd() * 0.6,
      });
    }
    const bulbs: InstanceItem[] = [];
    for (let z = d.frontZ + 2; z < d.backZ - 2; z += 1.6) {
      for (const side of [-1, 1]) {
        bulbs.push({
          p: [side * (sx - 0.9), d.floorY + parapetH + 0.18, z],
          s: [0.16, 0.16, 0.16],
        });
      }
    }
    for (let x = -sx + 2; x < sx - 2; x += 1.6) {
      bulbs.push({ p: [x, d.floorY + parapetH + 0.18, d.frontZ + 0.9], s: [0.16, 0.16, 0.16] });
    }
    const ac: InstanceItem[] = [];
    const fans: InstanceItem[] = [];
    const r2 = lcg(9);
    for (let z = d.backZ - 5; z > d.frontZ + 6; z -= 9 + r2() * 6) {
      for (const side of [-1, 1]) {
        if (r2() < 0.35) continue;
        const x = side * (sx - 3.6 - r2() * 1.2);
        ac.push({ p: [x, d.floorY + 0.9, z], s: [3, 1.8, 2.4], c: '#5a5e6c' });
        fans.push({ p: [x, d.floorY + 1.85, z], s: [0.9, 0.12, 0.9] });
      }
    }
    return { city, bulbs, ac, fans };
  }, [d, sx]);

  return (
    <group>
      <SkyDome
        top={theme.skyTop}
        mid={theme.skyMid}
        horizon={theme.skyHorizon}
        sun={theme.sun}
        sunDir={SUN_DIR}
        stars={0.8}
        haze={0.34}
      />
      <directionalLight position={[-82, 7, -57]} color={theme.sun} intensity={1.5} />

      {/* ---------- city skyline (single draw call, fogged into the dusk haze) ---------- */}
      <Instances items={scenery.city}>
        <meshBasicMaterial map={windowTex} color="#ffffff" />
      </Instances>

      {/* ---------- deck + parapets ---------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, d.centerZ]}>
        <planeGeometry args={[d.wallW + 14, d.wallD + 14]} />
        <meshStandardMaterial
          color={floorMap ? '#ffffff' : theme.floor}
          map={floorMap}
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * sx, parapetY, d.centerZ]}>
          <boxGeometry args={[0.9, parapetH, d.wallD]} />
          <meshStandardMaterial
            color={sideMap ? '#ffffff' : theme.wall}
            map={sideMap}
            roughness={0.9}
            metalness={0.05}
          />
        </mesh>
      ))}
      <mesh position={[0, parapetY, d.frontZ]}>
        <boxGeometry args={[d.wallW, parapetH, 0.9]} />
        <meshStandardMaterial
          color={endMap ? '#ffffff' : theme.wall}
          map={endMap}
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, parapetY, d.backZ]}>
        <boxGeometry args={[d.wallW, parapetH, 0.9]} />
        <meshStandardMaterial color={theme.wall} roughness={0.9} metalness={0.05} />
      </mesh>
      <Instances items={scenery.bulbs}>
        <meshBasicMaterial color={theme.lamp} toneMapped={false} />
      </Instances>

      {/* ---------- machinery (sides + behind only) ---------- */}
      <Instances items={scenery.ac}>
        <meshStandardMaterial color="#ffffff" roughness={0.6} metalness={0.4} />
      </Instances>
      <Instances shape="cylinder" items={scenery.fans}>
        <meshStandardMaterial color="#1c1e26" roughness={0.5} metalness={0.6} />
      </Instances>
      {/* water tower */}
      <group position={[-(sx - 5), d.floorY, d.backZ - 9]}>
        {(
          [
            [-1.3, -1.3],
            [1.3, -1.3],
            [-1.3, 1.3],
            [1.3, 1.3],
          ] as [number, number][]
        ).map(([lx, lz]) => (
          <mesh key={`${String(lx)}${String(lz)}`} position={[lx, 3, lz]}>
            <boxGeometry args={[0.22, 6, 0.22]} />
            <meshStandardMaterial color={theme.metalDark} roughness={0.7} metalness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 7.4, 0]}>
          <cylinderGeometry args={[2.2, 2.2, 3.4, 20]} />
          <meshStandardMaterial color="#6b4a33" roughness={0.8} metalness={0.2} />
        </mesh>
        <mesh position={[0, 9.7, 0]}>
          <coneGeometry args={[2.4, 1.4, 20]} />
          <meshStandardMaterial color="#3b3e4b" roughness={0.7} metalness={0.3} />
        </mesh>
      </group>
      {/* antenna mast with beacon */}
      <group position={[sx - 4, d.floorY, d.frontZ + 12]}>
        <mesh position={[0, 9, 0]}>
          <cylinderGeometry args={[0.12, 0.2, 18, 8]} />
          <meshStandardMaterial color={theme.metal} roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position={[0, 18.2, 0]}>
          <sphereGeometry args={[0.28, 12, 8]} />
          <meshBasicMaterial color={theme.accent} toneMapped={false} />
        </mesh>
      </group>
      {/* helipad marking behind the player */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY + 0.03, 8]}>
        <planeGeometry args={[11, 11]} />
        <meshBasicMaterial map={helipadTex} transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}
