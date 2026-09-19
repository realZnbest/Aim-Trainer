/**
 * Error heatmap: scatter of miss offsets around target center.
 * Bins misses into a 5x5 grid in units of target radii + cardinal bias stats.
 * @module analytics/heatmap
 */

export interface MissPoint {
  /** offset in target-radii: +x = right, +y = up */
  dxR: number;
  dyR: number;
}

export interface Heatmap {
  /** 5x5 row-major counts, rows top→bottom */
  grid: number[][];
  total: number;
  biasX: number;
  biasY: number;
  /** human-readable dominant bias */
  biasLabel:
    | 'centered'
    | 'left'
    | 'right'
    | 'low'
    | 'high'
    | 'low-left'
    | 'low-right'
    | 'high-left'
    | 'high-right';
}

const SIZE = 5;
const HALF = 2.5; // radii covered

function bin(v: number): number {
  const t = Math.max(-HALF, Math.min(HALF - 1e-9, v));
  return Math.min(SIZE - 1, Math.max(0, Math.floor(t + HALF)));
}

/** Build heatmap from miss offsets. Pure. */
export function buildHeatmap(misses: readonly MissPoint[]): Heatmap {
  const grid: number[][] = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  let sx = 0;
  let sy = 0;
  for (const m of misses) {
    const c = bin(m.dxR);
    const r = bin(-m.dyR); // y-up → row 0 is top
    const row = grid[r];
    if (row) row[c] = (row[c] ?? 0) + 1;
    sx += m.dxR;
    sy += m.dyR;
  }
  const n = misses.length;
  const biasX = n === 0 ? 0 : sx / n;
  const biasY = n === 0 ? 0 : sy / n;
  const horiz = biasX > 0.35 ? 'right' : biasX < -0.35 ? 'left' : '';
  const vert = biasY > 0.35 ? 'high' : biasY < -0.35 ? 'low' : '';
  const biasLabel =
    horiz === '' && vert === ''
      ? 'centered'
      : (`${vert}${vert !== '' && horiz !== '' ? '-' : ''}${horiz}` as Heatmap['biasLabel']);
  return { grid, total: n, biasX, biasY, biasLabel };
}
