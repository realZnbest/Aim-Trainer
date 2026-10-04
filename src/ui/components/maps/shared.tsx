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

/**
 * Procedural panel texture (no asset downloads — offline-first). Soft vertical
 * falloff, hairline seams and a little speckle so flat boxes read as material.
 */
export function makePanelCanvas(base: string, seam: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const shade = g.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  // deterministic speckle (fixed LCG, never Math.random)
  let seed = 7;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % size;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % size;
    g.fillStyle = seed & 1 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, y, 2, 2);
  }
  g.strokeStyle = seam;
  g.lineWidth = 4;
  g.strokeRect(0, 0, size, size);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(size / 2, 0);
  g.lineTo(size / 2, size);
  g.stroke();
  return c;
}

export interface Surfaces {
  floorMap: THREE.Texture | null;
  sideMap: THREE.Texture | null;
  endMap: THREE.Texture | null;
}

export function useSurfaces(
  theme: ArenaTheme,
  d: { wallW: number; wallH: number; wallD: number },
): Surfaces {
  const surfaces = useMemo<Surfaces>(() => {
    const floorCanvas = makePanelCanvas(theme.floor, theme.floorSeam);
    const wallCanvas = makePanelCanvas(theme.wall, theme.wallSeam);
    if (!floorCanvas || !wallCanvas) return { floorMap: null, sideMap: null, endMap: null };
    const make = (canvas: HTMLCanvasElement, rx: number, ry: number): THREE.Texture => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.repeat.set(Math.max(1, rx), Math.max(1, ry));
      return t;
    };
    return {
      floorMap: make(floorCanvas, (d.wallW + 14) / PANEL_M, (d.wallD + 14) / PANEL_M),
      sideMap: make(wallCanvas, d.wallD / PANEL_M, d.wallH / PANEL_M),
      endMap: make(wallCanvas, d.wallW / PANEL_M, d.wallH / PANEL_M),
    };
  }, [theme, d.wallW, d.wallH, d.wallD]);
  useEffect(
    () => () => {
      surfaces.floorMap?.dispose();
      surfaces.sideMap?.dispose();
      surfaces.endMap?.dispose();
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
      o.rotation.set(0, it.ry ?? 0, 0);
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
