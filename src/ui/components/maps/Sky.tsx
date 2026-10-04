import { useMemo, type ReactElement } from 'react';
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uStars;
uniform float uDisc;
uniform float uHaze;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Horizon glow hugs eye level only: the lane (+-30 deg) sits on the darker mid/top bands.
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, uHaze, h));
  col = mix(col, uTop, smoothstep(uHaze * 0.6, 0.85, h));
  col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.25, h));

  float s = max(dot(d, normalize(uSunDir)), 0.0);
  float glow = pow(s, 10.0) * 0.4 + pow(s, 90.0) * 0.8;
  float disc = smoothstep(0.9975, 0.9979, s);
  if (uDisc > 0.5) {
    // scanline-cut disc (lower half sliced), the synthwave sun
    float cut = d.y < 0.215 ? step(0.5, fract(d.y * 70.0)) : 1.0;
    disc *= cut;
  }
  col += uSun * (glow + disc * 2.0);

  vec3 sg = d * 260.0;
  float st = step(0.9965, hash(floor(sg))) * smoothstep(0.34, 0.0, length(fract(sg) - 0.5));
  col += vec3(st) * smoothstep(0.12, 0.5, h) * uStars;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Gradient sky dome with sun + stars. Camera never translates, so a fixed dome is enough. */
export function SkyDome({
  top,
  mid,
  horizon,
  sun,
  sunDir,
  stars = 0,
  disc = false,
  haze = 0.35,
}: {
  top: string;
  mid: string;
  horizon: string;
  sun: string;
  sunDir: [number, number, number];
  stars?: number;
  disc?: boolean;
  haze?: number;
}): ReactElement {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uHorizon: { value: new THREE.Color(horizon) },
      uSun: { value: new THREE.Color(sun) },
      uSunDir: { value: new THREE.Vector3(...sunDir) },
      uStars: { value: stars },
      uDisc: { value: disc ? 1 : 0 },
      uHaze: { value: haze },
    }),
    [top, mid, horizon, sun, sunDir, stars, disc, haze],
  );
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[480, 48, 32]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
