/**
 * Live performance telemetry: FPS, frame time, 1% low, input-to-photon estimate.
 *
 * Input-to-photon is ESTIMATED (true photon timing needs hardware): we model it as
 *   inputLatency (input poll → sim) + simToRender + half refresh interval + fixed display lag.
 * The fixed display term defaults to 8ms and is documented as an estimate in the HUD.
 *
 * @module engine/telemetry
 */

export interface TelemetrySample {
  fps: number;
  frameMs: number;
  avgMs: number;
  p1LowFps: number;
  inputToPhotonMs: number;
}

const WINDOW = 120;

export class Telemetry {
  private times: number[] = [];
  private last = 0;

  /** Call once per rendered frame with `performance.now()` timestamp. */
  frame(nowMs: number): TelemetrySample {
    if (this.last !== 0) {
      this.times.push(nowMs - this.last);
      if (this.times.length > WINDOW) this.times.shift();
    }
    this.last = nowMs;
    return this.snapshot();
  }

  snapshot(displayLagMs = 8): TelemetrySample {
    if (this.times.length === 0) {
      return { fps: 0, frameMs: 0, avgMs: 0, p1LowFps: 0, inputToPhotonMs: displayLagMs };
    }
    const sorted = [...this.times].sort((a, b) => a - b);
    const avg = this.times.reduce((s, v) => s + v, 0) / this.times.length;
    const worst1pct = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? avg;
    const fps = 1000 / avg;
    const p1LowFps = 1000 / worst1pct;
    // Estimate: sim step (~1000/240/2 avg wait) + frame time + half refresh + display lag
    const inputToPhotonMs = 1000 / 240 / 2 + avg + 1000 / 144 / 2 + displayLagMs;
    return {
      fps,
      frameMs: this.times[this.times.length - 1] ?? 0,
      avgMs: avg,
      p1LowFps,
      inputToPhotonMs,
    };
  }

  reset(): void {
    this.times = [];
    this.last = 0;
  }
}
