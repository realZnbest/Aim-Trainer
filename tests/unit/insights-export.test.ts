import { describe, expect, it } from 'vitest';
import { detectWeaknesses } from '@/analytics/insights';
import { sessionsToCsv } from '@/ui/export';
import type { SessionRecord } from '@/persistence/db';

describe('insights', () => {
  it('flags low accuracy + overshoot + bias with scenario recommendations', () => {
    const out = detectWeaknesses({
      accuracy: 0.5,
      killsPerSec: 2,
      reaction: { count: 10, mean: 300, median: 290, p95: 450, sd: 120, min: 200, max: 500 },
      flick: { overshootRatio: 0.5, undershootRatio: 0, cleanRatio: 0.5, avgCorrections: 1 },
      tracking: { timeOnTargetPct: 40, rmsErrorDeg: 2.5, meanErrorDeg: 2, samples: 100 },
      missBias: 'low-right',
    });
    const ids = out.map((i) => i.id);
    expect(ids).toContain('accuracy-low');
    expect(ids).toContain('inconsistent-reaction');
    expect(ids).toContain('overshoot');
    expect(ids).toContain('tracking-low');
    expect(ids).toContain('aim-bias');
    expect(out[0]?.recommendedScenarioId).toBeTruthy();
  });

  it('flags undershoot + slow pace', () => {
    const out = detectWeaknesses({
      accuracy: 0.85,
      killsPerSec: 0.8,
      reaction: { count: 10, mean: 250, median: 245, p95: 300, sd: 20, min: 220, max: 310 },
      flick: { overshootRatio: 0, undershootRatio: 0.6, cleanRatio: 0.4, avgCorrections: 1.5 },
      tracking: null,
      missBias: 'centered',
    });
    expect(out.map((i) => i.id)).toEqual(expect.arrayContaining(['undershoot', 'speed-low']));
  });

  it('clean run → no insights', () => {
    const out = detectWeaknesses({
      accuracy: 0.95,
      killsPerSec: 2.5,
      reaction: { count: 10, mean: 250, median: 245, p95: 300, sd: 20, min: 220, max: 310 },
      flick: { overshootRatio: 0.1, undershootRatio: 0.1, cleanRatio: 0.8, avgCorrections: 0.2 },
      tracking: null,
      missBias: 'centered',
    });
    expect(out).toEqual([]);
  });
});

describe('export', () => {
  it('sessionsToCsv emits header + rows with quoting', () => {
    const rows = [
      {
        id: 1,
        scenarioId: 'gridshot',
        mode: 'gridshot',
        seed: 'a,b',
        startedAt: 't',
        durationSec: 60,
        score: 700,
        accuracy: 0.8,
        kills: 100,
        shots: 120,
        hits: 96,
        killsPerSec: 1.6,
        reactionMean: 300,
        reactionMedian: 290,
        reactionP95: 400,
        reactionSd: 50,
        overshootRatio: 0.1,
        undershootRatio: 0.1,
        timeOnTargetPct: null,
        rmsErrorDeg: null,
        tier: 'Gold',
        percentile: 55,
        replayJson: '',
        telemetryJson: '',
      } as SessionRecord,
    ];
    const csv = sessionsToCsv(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('score');
    expect(lines[1]).toContain('"a,b"');
    expect(sessionsToCsv([])).toBe(
      'id,scenarioId,mode,seed,startedAt,durationSec,score,accuracy,kills,shots,hits,killsPerSec,reactionMean,reactionMedian,reactionP95,reactionSd,overshootRatio,undershootRatio,timeOnTargetPct,rmsErrorDeg,tier,percentile',
    );
  });
});
