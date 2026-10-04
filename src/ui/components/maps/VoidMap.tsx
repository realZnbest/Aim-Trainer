import { useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import type { ArenaTheme } from '../../arenaThemes';
import type { ArenaDims } from './dims';
import { SkyDome } from './Sky';
import { Instances, lcg, useCanvasTexture, type InstanceItem } from './shared';

const SUN_DIR: [number, number, number] = [-0.78, 0.17, -0.6];

const GRID_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const GRID_FRAG = /* glsl */ `
varying vec3 vPos;
uniform vec3 uMajor;
uniform vec3 uMinor;

float gridLine(vec2 p) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  float minor = gridLine(vPos.xz / 4.0);
  float major = gridLine(vPos.xz / 20.0);
  float dist = length(vPos.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(60.0, 420.0, dist);
  vec3 col = uMinor * minor * 0.5 + uMajor * major * 0.9;
  gl_FragColor = vec4(col * fade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Synthwave void: no walls at all. Striped sun well off the lane, reflective black floor
 * with a glowing perspective grid, wire-edged low-poly ridges. The lane itself is empty sky
 * (dark violet band at eye level), so targets have the cleanest contrast of any map.
 */
export function VoidMap({
  d,
  theme,
  reflections,
}: {
  d: ArenaDims;
  theme: ArenaTheme;
  reflections: boolean;
}): ReactElement {
  const gridUniforms = useMemo(
    () => ({
      uMajor: { value: new THREE.Color(theme.gridMajor) },
      uMinor: { value: new THREE.Color(theme.gridMinor) },
    }),
    [theme.gridMajor, theme.gridMinor],
  );
  const ridges = useMemo(() => {
    const rnd = lcg(3);
    const out: InstanceItem[] = [];
    for (let i = 0; i < 70; i++) {
      const theta = (rnd() * 2 - 1) * Math.PI; // anywhere around, but...
      const r = 150 + rnd() * 260;
      const front = Math.abs(theta) < (55 * Math.PI) / 180;
      // ...ridges in front of the lane stay tiny so the horizon behind targets is clean.
      const h = front ? 4 + rnd() * 9 : 18 + rnd() * 70;
      const rad = front ? 14 + rnd() * 20 : 26 + rnd() * 50;
      out.push({
        p: [r * Math.sin(theta), d.floorY + h / 2, -r * Math.cos(theta)],
        s: [rad, h, rad],
        ry: rnd() * Math.PI,
      });
    }
    return out;
  }, [d.floorY]);

  const pylons = useMemo(() => {
    const rnd = lcg(17);
    const out: InstanceItem[] = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const theta = (side * ((58 + rnd() * 70) * Math.PI)) / 180;
      const r = 90 + rnd() * 140;
      const h = 40 + rnd() * 70;
      out.push({
        p: [r * Math.sin(theta), d.floorY + h / 2, -r * Math.cos(theta)],
        s: [0.9, h, 0.9],
        c: i % 3 === 0 ? theme.accent : theme.glow,
      });
    }
    return out;
  }, [d.floorY, theme.accent, theme.glow]);
  const planetTex = useCanvasTexture('planet-bands', 256, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    const stops = ['#3a1470', '#7a2cff', '#2a0b52', '#c04bff', '#3a1470', '#6a1fb0', '#1c0a3d'];
    stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

  return (
    <group>
      <SkyDome
        top={theme.skyTop}
        mid={theme.skyMid}
        horizon={theme.skyHorizon}
        sun={theme.sun}
        sunDir={SUN_DIR}
        stars={1}
        disc
        haze={0.22}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY, 0]}>
        <planeGeometry args={[1000, 1000]} />
        {reflections ? (
          <MeshReflectorMaterial
            color="#06020f"
            blur={[300, 100]}
            resolution={384}
            mixBlur={1}
            mixStrength={26}
            roughness={0.9}
            metalness={0.6}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            mirror={0.7}
          />
        ) : (
          <meshStandardMaterial color="#06020f" roughness={0.6} metalness={0.5} />
        )}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, d.floorY + 0.02, 0]} renderOrder={1}>
        <planeGeometry args={[1000, 1000]} />
        <shaderMaterial
          vertexShader={GRID_VERT}
          fragmentShader={GRID_FRAG}
          uniforms={gridUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* ringed planet, well right of the lane so the horizon behind targets stays clean */}
      <group position={[330, 70, -170]} rotation={[0.35, 0, 0.3]}>
        <mesh>
          <sphereGeometry args={[40, 32, 20]} />
          <meshBasicMaterial map={planetTex} fog={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[52, 74, 64]} />
          <meshBasicMaterial
            color={theme.accent}
            transparent
            opacity={0.45}
            side={THREE.DoubleSide}
            fog={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <Instances items={pylons}>
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </Instances>
      <Instances shape="pyramid" items={ridges}>
        <meshBasicMaterial
          color="#08031a"
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </Instances>
      <Instances shape="pyramid" items={ridges}>
        <meshBasicMaterial color={theme.glow} wireframe toneMapped={false} />
      </Instances>
    </group>
  );
}
