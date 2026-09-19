/**
 * Fixed-timestep simulation loop decoupled from rAF rendering + interpolation.
 *
 * - Logic ticks at `tickHz` (default 240Hz) using an accumulator.
 * - Rendering runs on rAF; presentation interpolates between the last two
 *   simulation states with `alpha`.
 * - All timestamps use `performance.now()` (sub-ms, monotonic).
 * - Spiral-of-death guard: max 8 steps per frame, then drop time.
 *
 * @module engine/loop
 */

export interface LoopCallbacks {
  /** Advance simulation by fixed dt (seconds). Called 0..n times per frame. */
  step: (dtSec: number, simTimeMs: number) => void;
  /** Render presentation; alpha in [0,1] interpolates prev→current state. */
  render: (alpha: number, frameTimeMs: number) => void;
}

export interface FixedLoop {
  start: () => void;
  stop: () => void;
  /** Current simulation time in ms. */
  readonly simTimeMs: number;
  /** Last measured frame delta in ms. */
  readonly lastFrameMs: number;
}

export function createFixedLoop(callbacks: LoopCallbacks, tickHz = 240): FixedLoop {
  const stepMs = 1000 / tickHz;
  let raf = 0;
  let running = false;
  let simTimeMs = 0;
  let lastFrameMs = 16.7;
  let lastT = 0;
  let acc = 0;

  function frame(nowMs: number): void {
    if (!running) return;
    if (lastT === 0) lastT = nowMs;
    let frameMs = nowMs - lastT;
    lastT = nowMs;
    // Clamp huge gaps (tab switch) to avoid spiral of death
    if (frameMs > 250) frameMs = 250;
    lastFrameMs = frameMs;
    acc += frameMs;

    let steps = 0;
    while (acc >= stepMs && steps < 8) {
      simTimeMs += stepMs;
      callbacks.step(stepMs / 1000, simTimeMs);
      acc -= stepMs;
      steps++;
    }
    if (steps === 8) acc = 0; // drop backlog rather than spiral

    const alpha = acc / stepMs;
    callbacks.render(alpha, frameMs);
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastT = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get simTimeMs(): number {
      return simTimeMs;
    },
    get lastFrameMs(): number {
      return lastFrameMs;
    },
  };
}
