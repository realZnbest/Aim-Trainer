/**
 * Skill rating: z-score vs baseline → percentile → tier.
 * Tiers: Bronze → Silver → Gold → Platinum → Diamond → Master → Grandmaster.
 * Baselines are per-mode (score distribution mean/sd from reference population).
 * @module analytics/rating
 */
import { normalCdf, zScore } from './statistics';

export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master' | 'Grandmaster';

export interface Baseline {
  mean: number;
  sd: number;
}

/** Reference baselines per scenario mode (v1, documented in DECISIONS.md D-09). */
export const BASELINES: Record<string, Baseline> = {
  gridshot: { mean: 620, sd: 130 },
  spidershot: { mean: 540, sd: 140 },
  microshot: { mean: 480, sd: 150 },
  tracking: { mean: 560, sd: 120 },
  switching: { mean: 600, sd: 130 },
  reflex: { mean: 520, sd: 140 },
  'strafe-track': { mean: 500, sd: 130 },
  'target-switching-speed': { mean: 610, sd: 135 },
  custom: { mean: 550, sd: 140 },
};

export interface Rating {
  score: number;
  z: number;
  percentile: number;
  tier: Tier;
}

export function tierForPercentile(p: number): Tier {
  if (p >= 99) return 'Grandmaster';
  if (p >= 95) return 'Master';
  if (p >= 85) return 'Diamond';
  if (p >= 70) return 'Platinum';
  if (p >= 50) return 'Gold';
  if (p >= 25) return 'Silver';
  return 'Bronze';
}

/** Rate a score against a mode baseline. Pure + deterministic. */
export function rateScore(score: number, mode: string): Rating {
  const b = BASELINES[mode] ?? BASELINES['custom'];
  if (!b) throw new Error('missing baseline');
  const z = zScore(score, b.mean, b.sd);
  // Round to 2dp so exact-boundary scores (e.g. z=0 → 50%) tier deterministically.
  const percentile = Math.round(normalCdf(z) * 10000) / 100;
  return { score, z, percentile, tier: tierForPercentile(percentile) };
}
