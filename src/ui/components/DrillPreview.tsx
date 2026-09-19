import { useEffect, useRef, type ReactElement } from 'react';

/**
 * Animated schematic preview per drill — a tiny live diagram of how the mode
 * behaves (spawn rhythm, movement profile, target count). This is a schematic,
 * not footage: it demonstrates the mechanism so the athlete can pick a drill
 * by sight. One shared rAF loop drives all mounted previews; offscreen ones
 * are paused via IntersectionObserver. Static frame under reduced-motion.
 */

const W = 360;
const H = 180;
const TARGET = '#3772A4';
const BRIGHT = '#7fb2ff';
const FLASH = '#ffffff';
const SIGHT = '#ffffff';

function prand(n: number, seed: number): number {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Handle {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mode: string;
  seed: number;
  visible: boolean;
}

const live = new Set<Handle>();
let loopOn = false;
let lastDraw = 0;

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function sight(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = SIGHT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
}

function draw(h: Handle, t: number): void {
  const { ctx, mode, seed } = h;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;

  switch (mode) {
    case 'gridshot': {
      // Scattered asymmetric targets — not a tidy grid
      const spots: Array<[number, number]> = [
        [70, 44],
        [252, 34],
        [138, 132],
        [302, 138],
      ];
      const idx = Math.floor(t / 0.5) % spots.length;
      spots.forEach(([x, y], i) => {
        dot(ctx, x, y, 7, i === idx ? FLASH : TARGET);
      });
      sight(ctx, cx, cy);
      break;
    }
    case 'spidershot': {
      const k = Math.floor(t / 0.8);
      const age = t - k * 0.8;
      const x = 40 + prand(k, seed) * (W - 80);
      const y = 24 + prand(k + 9, seed) * (H - 48);
      dot(ctx, x, y, age < 0.12 ? 9 : 7, age < 0.12 ? FLASH : TARGET);
      sight(ctx, cx, cy);
      break;
    }
    case 'microshot': {
      dot(ctx, cx - 60 + Math.sin(t * 1.3) * 3, cy - 10, 3.5, TARGET);
      dot(ctx, cx + 70 + Math.cos(t * 1.1) * 3, cy + 14, 3.5, TARGET);
      dot(ctx, cx + 10, cy - 24, 3, BRIGHT);
      sight(ctx, cx, cy);
      break;
    }
    case 'tracking': {
      const x = cx + Math.sin(t * 2.2) * 110;
      const y = cy + Math.cos(t * 1.6) * 26;
      ctx.strokeStyle = 'rgba(127,178,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const tt = t - (40 - i) * 0.02;
        const px = cx + Math.sin(tt * 2.2) * 110;
        const py = cy + Math.cos(tt * 1.6) * 26;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      dot(ctx, x, y, 8, TARGET);
      // sight chases with a lag — the tracking task itself
      const lx = cx + Math.sin((t - 0.18) * 2.2) * 110;
      const ly = cy + Math.cos((t - 0.18) * 1.6) * 26;
      sight(ctx, lx, ly);
      break;
    }
    case 'switching': {
      const left = Math.floor(t / 0.7) % 2 === 0;
      dot(ctx, cx - 100, cy, 8, left ? FLASH : TARGET);
      dot(ctx, cx + 100, cy, 8, left ? TARGET : FLASH);
      sight(ctx, left ? cx - 100 : cx + 100, cy);
      break;
    }
    case 'reflex': {
      const cycle = t % 1.6;
      if (cycle < 0.55) {
        const k = Math.floor(t / 1.6);
        const x = 40 + prand(k, seed) * (W - 80);
        const y = 24 + prand(k + 3, seed) * (H - 48);
        dot(ctx, x, y, 8, TARGET);
        if (cycle < 0.12) {
          ctx.strokeStyle = FLASH;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 8 + cycle * 60, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      sight(ctx, cx, cy);
      break;
    }
    case 'strafe-track': {
      // fast lateral bursts with flips — unreadable on purpose
      const k = Math.floor(t / 0.9);
      const dir = prand(k, seed) > 0.45 ? 1 : -1;
      const local = (t - k * 0.9) / 0.9;
      const prevX = cx + (prand(k - 1, seed) - 0.5) * 200;
      const x = prevX + dir * local * 140;
      const y = cy + Math.sin(t * 5 + seed) * 14;
      dot(ctx, Math.max(20, Math.min(W - 20, x)), y, 8, TARGET);
      sight(ctx, cx + Math.sin(t * 3.1) * 40, cy);
      break;
    }
    case 'target-switching-speed': {
      const step = Math.floor(t / 0.45) % 6;
      for (let i = 0; i < 5; i++) {
        if (i < step) continue; // cleared
        const x = 44 + i * 68;
        const y = cy + (i % 2 === 0 ? -18 : 18);
        dot(ctx, x, y, i === step ? 9 : 7, i === step ? FLASH : TARGET);
      }
      sight(ctx, cx, cy);
      break;
    }
    default: {
      // custom / sandbox: mixed vocabulary
      const x = cx + Math.sin(t * 1.8) * 90;
      dot(ctx, x, cy - 16, 7, TARGET);
      dot(ctx, cx + 110, cy + 20, 6, BRIGHT);
      sight(ctx, cx, cy);
    }
  }
}

function tick(now: number): void {
  if (live.size === 0) {
    loopOn = false;
    return;
  }
  if (now - lastDraw >= 33) {
    lastDraw = now;
    const t = now / 1000;
    for (const h of live) {
      if (h.visible) draw(h, t + h.seed * 1.7);
    }
  }
  requestAnimationFrame(tick);
}

function ensureLoop(): void {
  if (loopOn) return;
  loopOn = true;
  requestAnimationFrame(tick);
}

export function DrillPreview({ mode, seed = 0 }: { mode: string; seed?: number }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw({ canvas, ctx, mode, seed, visible: true }, 1.2 + seed * 1.7);
      return;
    }

    const h: Handle = { canvas, ctx, mode, seed, visible: true };
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) h.visible = e.isIntersecting;
      },
      { threshold: 0.1 },
    );
    io.observe(canvas);
    live.add(h);
    ensureLoop();
    return () => {
      io.disconnect();
      live.delete(h);
    };
  }, [mode, seed]);

  return <canvas ref={ref} style={{ width: '100%', height: 170, display: 'block' }} aria-hidden />;
}
