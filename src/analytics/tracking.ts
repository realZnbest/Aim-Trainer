/**
 * Tracking metrics: time-on-target % + RMS angular error.
 * Sampled every sim tick while a tracking target is alive.
 * @module analytics/tracking
 */

export interface TrackingSample {
  /** angular error crosshair→target center (deg) at tick */
  errorDeg: number;
  /** target angular radius (deg) at tick */
  radiusDeg: number;
}

export interface TrackingMetrics {
  timeOnTargetPct: number;
  rmsErrorDeg: number;
  meanErrorDeg: number;
  samples: number;
}

/** Compute tracking metrics from per-tick samples. Pure. */
export function computeTrackingMetrics(samples: readonly TrackingSample[]): TrackingMetrics {
  if (samples.length === 0) {
    return { timeOnTargetPct: 0, rmsErrorDeg: 0, meanErrorDeg: 0, samples: 0 };
  }
  let on = 0;
  let sum = 0;
  let sumSq = 0;
  for (const s of samples) {
    if (s.errorDeg <= s.radiusDeg) on++;
    sum += s.errorDeg;
    sumSq += s.errorDeg * s.errorDeg;
  }
  return {
    timeOnTargetPct: (on / samples.length) * 100,
    rmsErrorDeg: Math.sqrt(sumSq / samples.length),
    meanErrorDeg: sum / samples.length,
    samples: samples.length,
  };
}
