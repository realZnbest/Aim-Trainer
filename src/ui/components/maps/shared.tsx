import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import type { ArenaTheme } from '../../arenaThemes';

export const PANEL_M = 4; // meters per wall/floor panel tile

export interface PanelCanvases {
  color: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  rough: HTMLCanvasElement;
}

/**
 * Procedural PBR panel set (no asset downloads — offline-first), generated once per theme:
 * colour (gradient, speckle, wear blotches, scratches, rivets, seams), a height field turned
 * into a tangent-space normal map, and a roughness map. Fixed LCG, so output is stable.
 */
export function makePanelCanvases(base: string, seam: string): PanelCanvases | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] | null => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    return g ? [c, g] : null;
  };
  const col = mk();
  const hgt = mk();
  const rgh = mk();
  const nrm = mk();
  if (!col || !hgt || !rgh || !nrm) return null;
  const [colC, g] = col;
  const h = hgt[1];
  const [rC, r] = rgh;
  const [nC, n] = nrm;
  const rnd = lcg(7);

  // --- colour
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const shade = g.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6; i++) {
    // wear / stain blotches
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = 24 + rnd() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    // fine scratches
    g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
    const x = rnd() * size;
    const y = rnd() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 12);
    g.stroke();
  }
  g.strokeStyle = seam;
  g.lineWidth = 4;
  g.strokeRect(0, 0, size, size);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(size / 2, 0);
  g.lineTo(size / 2, size);
  g.stroke();
  for (const [x, y] of [
    [10, 10],
    [size - 10, 10],
    [10, size - 10],
    [size - 10, size - 10],
  ] as [number, number][]) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; // rivet shadow
    g.beginPath();
    g.arc(x + 0.8, y + 0.8, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.arc(x, y, 2.4, 0, Math.PI * 2);
    g.fill();
  }

  // --- height field: noise + grooves + bevel + rivet bumps
  h.fillStyle = '#808080';
  h.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i++) {
    const v = 100 + Math.floor(rnd() * 56);
    h.fillStyle = `rgb(${String(v)},${String(v)},${String(v)})`;
    h.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  h.strokeStyle = '#303030';
  h.lineWidth = 5;
  h.strokeRect(0, 0, size, size);
  h.lineWidth = 2;
  h.beginPath();
  h.moveTo(size / 2, 0);
  h.lineTo(size / 2, size);
  h.stroke();
  for (const [x, y] of [
    [10, 10],
    [size - 10, 10],
    [10, size - 10],
    [size - 10, size - 10],
  ] as [number, number][]) {
    h.fillStyle = '#e0e0e0';
    h.beginPath();
    h.arc(x, y, 3, 0, Math.PI * 2);
    h.fill();
  }
  const hd = h.getImageData(0, 0, size, size).data;
  const out = n.createImageData(size, size);
  const at = (x: number, y: number): number =>
    hd[(((y + size) % size) * size + ((x + size) % size)) * 4] ?? 128;
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const inv = 1 / Math.sqrt(dx * dx * strength * strength + dy * dy * strength * strength + 1);
      const i = (y * size + x) * 4;
      out.data[i] = Math.round((-dx * strength * inv * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((dy * strength * inv * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  n.putImageData(out, 0, 0);

  // --- roughness (G channel): mostly mid, scuffed patches glossier, seams rougher
  r.fillStyle = 'rgb(150,150,150)';
  r.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    const v = 120 + Math.floor(rnd() * 90);
    r.fillStyle = `rgb(${String(v)},${String(v)},${String(v)})`;
    r.fillRect(rnd() * size, rnd() * size, 3, 3);
  }
  r.strokeStyle = 'rgb(220,220,220)';
  r.lineWidth = 4;
  r.strokeRect(0, 0, size, size);

  return { color: colC, normal: nC, rough: rC };
}

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export interface Surfaces {
  floor: SurfaceMaps | null;
  side: SurfaceMaps | null;
  end: SurfaceMaps | null;
}

const NORMAL_SCALE = new THREE.Vector2(0.55, 0.55);

/** Material props for a surface set (white base so the texture carries the colour). */
export function surfaceProps(
  m: SurfaceMaps | null,
  fallbackColor: string,
  roughness = 1,
): {
  color: string;
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: THREE.Vector2;
  roughnessMap?: THREE.Texture;
  roughness: number;
} {
  if (!m) return { color: fallbackColor, roughness: 0.8 };
  return {
    color: '#ffffff',
    map: m.map,
    normalMap: m.normalMap,
    normalScale: NORMAL_SCALE,
    roughnessMap: m.roughnessMap,
    roughness,
  };
}

const NO_SURFACES: Surfaces = { floor: null, side: null, end: null };

export function useSurfaces(
  theme: ArenaTheme,
  d: { wallW: number; wallH: number; wallD: number },
): Surfaces {
  const surfaces = useMemo<Surfaces>(() => {
    const floorSet = makePanelCanvases(theme.floor, theme.floorSeam);
    const wallSet = makePanelCanvases(theme.wall, theme.wallSeam);
    if (!floorSet || !wallSet) return NO_SURFACES;
    const tex = (c: HTMLCanvasElement, srgb: boolean, rx: number, ry: number): THREE.Texture => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.repeat.set(Math.max(1, rx), Math.max(1, ry));
      return t;
    };
    const set = (c: PanelCanvases, rx: number, ry: number): SurfaceMaps => ({
      map: tex(c.color, true, rx, ry),
      normalMap: tex(c.normal, false, rx, ry),
      roughnessMap: tex(c.rough, false, rx, ry),
    });
    return {
      floor: set(floorSet, (d.wallW + 14) / PANEL_M, (d.wallD + 14) / PANEL_M),
      side: set(wallSet, d.wallD / PANEL_M, d.wallH / PANEL_M),
      end: set(wallSet, d.wallW / PANEL_M, d.wallH / PANEL_M),
    };
  }, [theme, d.wallW, d.wallH, d.wallD]);
  useEffect(
    () => () => {
      for (const m of [surfaces.floor, surfaces.side, surfaces.end]) {
        m?.map.dispose();
        m?.normalMap.dispose();
        m?.roughnessMap.dispose();
      }
    },
    [surfaces],
  );
  return surfaces;
}

/** Evenly spaced z slots between back and front, capped count for huge rooms. */
export function zSlots(
  backZ: number,
  frontZ: number,
  step: number,
  inset: number,
  cap: number,
): number[] {
  const out: number[] = [];
  const s = backZ - frontZ > 150 ? step * 2 : step;
  for (let z = backZ - inset; z > frontZ + inset && out.length < cap; z -= s)
    out.push(Math.round(z * 10) / 10);
  return out;
}

/** Tiny deterministic RNG for static scenery (never Math.random — layouts are stable). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface InstanceItem {
  p: [number, number, number];
  s: [number, number, number];
  /** Optional per-instance tint (multiplies the material color/map). */
  c?: string;
  ry?: number;
  /** Full XYZ rotation (radians); wins over `ry`. */
  r?: [number, number, number];
}

export type InstanceShape = 'box' | 'cylinder' | 'pyramid' | 'cone';

/**
 * One draw call for many static props. Unit geometry scaled per instance:
 * box = 1x1x1 centered, cylinder = r1 h1 centered, pyramid = 4-sided r1 h1, cone = 12-sided.
 */
export function Instances({
  items,
  shape = 'box',
  children,
}: {
  items: InstanceItem[];
  shape?: InstanceShape;
  children: ReactNode;
}): ReactElement | null {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.set(...it.s);
      if (it.r) o.rotation.set(...it.r);
      else o.rotation.set(0, it.ry ?? 0, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (it.c) mesh.setColorAt(i, col.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[undefined, undefined, items.length]}
      frustumCulled={false}
    >
      {shape === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {shape === 'cylinder' && <cylinderGeometry args={[1, 1, 1, 16]} />}
      {shape === 'pyramid' && <coneGeometry args={[1, 1, 4]} />}
      {shape === 'cone' && <coneGeometry args={[1, 1, 12]} />}
      {children}
    </instancedMesh>
  );
}

/** Generate (and dispose) a small canvas texture. `key` is the cache key: change it to redraw. */
export function useCanvasTexture(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat: [number, number] = [1, 1],
): THREE.CanvasTexture | null {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(repeat[0], repeat[1]);
    return t;
    // `key` is the explicit invalidation signal; draw/repeat are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}
