/**
 * Deterministic scoring.
 *
 * Score = 1000 * (wAcc*acc + wSpd*speedIdx + wPrec*precIdx)/ (wAcc+wSpd+wPrec) * difficulty
 *   acc      = hits / shots
 *   speedIdx = clamp(killsPerSec / 4, 0..1)        (4 KPS ≈ elite gridshot pace)
 *   precIdx  = clamp(1 - medianErrDeg / 5, 0..1)   (5° error ≈ worst useful)
 *   difficulty = 1 + 0.15*(targetCount-1)/4 + sizeBonus + speedBonus
 *     sizeBonus  = clamp((0.35 - avgSize)/0.35, 0..1) * 0.25
 *     speedBonus = clamp(avgSpeed/8, 0..1) * 0.25
 *
 * Deterministic: same inputs → identical float. Unit-tested with golden values.
 *
 * @module analytics/scoring
 */

export interface ScoreInput {
  hits: number;
  shots: number;
  kills: number;
  durationSec: number;
  medianErrorDeg: number;
  avgTargetSize: number;
  avgTargetSpeed: number;
  targetCount: number;
  weights?: { accuracy?: number; speed?: number; precision?: number };
}

export interface ScoreBreakdown {
  score: number;
  accuracy: number;
  killsPerSec: number;
  speedIdx: number;
  precisionIdx: number;
  difficulty: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function computeScore(i: ScoreInput): ScoreBreakdown {
  const accuracy = i.shots > 0 ? i.hits / i.shots : 0;
  const killsPerSec = i.durationSec > 0 ? i.kills / i.durationSec : 0;
  const speedIdx = clamp01(killsPerSec / 4);
  const precisionIdx = clamp01(1 - i.medianErrorDeg / 5);
  const wAcc = i.weights?.accuracy ?? 1;
  const wSpd = i.weights?.speed ?? 1;
  const wPrec = i.weights?.precision ?? 1;
  const wSum = Math.max(1e-9, wAcc + wSpd + wPrec);
  const base = (wAcc * accuracy + wSpd * speedIdx + wPrec * precisionIdx) / wSum;
  const sizeBonus = clamp01((0.35 - i.avgTargetSize) / 0.35) * 0.25;
  const speedBonus = clamp01(i.avgTargetSpeed / 8) * 0.25;
  const countBonus = (0.15 * (Math.max(1, i.targetCount) - 1)) / 4;
  const difficulty = 1 + countBonus + sizeBonus + speedBonus;
  const score = Math.round(1000 * base * difficulty);
  return { score, accuracy, killsPerSec, speedIdx, precisionIdx, difficulty };
}
