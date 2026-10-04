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
uniform float uClouds;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Horizon glow hugs eye level only: the lane (+-30 deg) sits on the darker mid/top bands.
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, uHaze, h));
  col = mix(col, uTop, smoothstep(uHaze * 0.6, 0.85, h));
  col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.25, h));

  float s = max(dot(d, normalize(uSunDir)), 0.0);
  if (uClouds > 0.0 && h > 0.02) {
    // Flat cloud deck projected overhead: dark undersides, sun-lit rims toward the sun.
    vec2 cp = d.xz / (h + 0.18) * 1.7;
    float c = smoothstep(0.48, 0.82, fbm(cp));
    float lit = pow(s, 3.0);
    vec3 cloud = mix(uMid * 0.9, uSun, lit * 0.9);
    float band = smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.55, 0.95, h));
    col = mix(col, cloud, c * uClouds * band);
  }
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
  clouds = 0,
}: {
  top: string;
  mid: string;
  horizon: string;
  sun: string;
  sunDir: [number, number, number];
  stars?: number;
  disc?: boolean;
  haze?: number;
  clouds?: number;
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
      uClouds: { value: clouds },
    }),
    [top, mid, horizon, sun, sunDir, stars, disc, haze, clouds],
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
