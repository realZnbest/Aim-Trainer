/**
 * Insights: weakness detection + recommended training plan. Pure functions.
 * @module analytics/insights
 */
import type { FlickAggregate } from './flick';
import type { TrackingMetrics } from './tracking';
import type { Summary } from './statistics';

export interface SessionSummary {
  accuracy: number;
  killsPerSec: number;
  reaction: Summary;
  flick: FlickAggregate;
  tracking: TrackingMetrics | null;
  missBias: string;
}

export interface Insight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  recommendedScenarioId: string;
}

/** Detect weaknesses and recommend drills. */
export function detectWeaknesses(s: SessionSummary): Insight[] {
  const out: Insight[] = [];
  if (s.accuracy < 0.75) {
    out.push({
      id: 'accuracy-low',
      severity: s.accuracy < 0.6 ? 'critical' : 'warning',
      title: 'Accuracy below 75%',
      detail: `Hit rate ${(s.accuracy * 100).toFixed(1)}%. Slow down and confirm crosshair placement before clicking — try Microshot.`,
      recommendedScenarioId: 'microshot',
    });
  }
  if (s.reaction.count > 4 && s.reaction.sd > 90) {
    out.push({
      id: 'inconsistent-reaction',
      severity: 'warning',
      title: 'Inconsistent reaction time',
      detail: `Reaction SD ${s.reaction.sd.toFixed(0)}ms is high. Reflex drills with random delays will stabilize first-shot timing.`,
      recommendedScenarioId: 'reflex-reactive',
    });
  }
  if (s.flick.overshootRatio > 0.35) {
    out.push({
      id: 'overshoot',
      severity: 'warning',
      title: 'Systematic overshoot',
      detail: `${(s.flick.overshootRatio * 100).toFixed(0)}% of flicks overshoot. Lower sensitivity ~5% or drill Switching with a metronome pace.`,
      recommendedScenarioId: 'switching',
    });
  }
  if (s.flick.undershootRatio > 0.35) {
    out.push({
      id: 'undershoot',
      severity: 'warning',
      title: 'Systematic undershoot',
      detail: `${(s.flick.undershootRatio * 100).toFixed(0)}% of flicks fall short. Commit to the flick — Spidershot at +1 target size.`,
      recommendedScenarioId: 'spidershot',
    });
  }
  if (s.tracking && s.tracking.timeOnTargetPct < 55) {
    out.push({
      id: 'tracking-low',
      severity: 'warning',
      title: 'Low time on target',
      detail: `On-target ${s.tracking.timeOnTargetPct.toFixed(1)}% with RMS error ${s.tracking.rmsErrorDeg.toFixed(2)}°. Smooth-tracking (Motion) at low speed, then Strafe Track.`,
      recommendedScenarioId: 'tracking-motion',
    });
  }
  if (s.killsPerSec < 1.2) {
    out.push({
      id: 'speed-low',
      severity: 'info',
      title: 'Kill pace can improve',
      detail: `${s.killsPerSec.toFixed(2)} kills/s. Gridshot pushes target acquisition speed without punishing misses hard.`,
      recommendedScenarioId: 'gridshot',
    });
  }
  if (s.missBias !== 'centered') {
    out.push({
      id: 'aim-bias',
      severity: 'info',
      title: `Aim bias: ${s.missBias}`,
      detail: `Misses cluster ${s.missBias}. Consciously hold opposite-side placement for 20 kills, then re-test.`,
      recommendedScenarioId: 'microshot',
    });
  }
  return out;
}
