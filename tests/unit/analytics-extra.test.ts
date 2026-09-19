import { describe, expect, it } from 'vitest';
import { computeTrackingMetrics } from '@/analytics/tracking';
import { buildHeatmap } from '@/analytics/heatmap';
import { rateScore, tierForPercentile } from '@/analytics/rating';
import { createReplay, deserializeReplay, recordEvent, serializeReplay } from '@/analytics/replay';
import { createPool } from '@/engine/pool';
import { createWeaponState, tryTrigger, updateWeapon, rollSpreadRad } from '@/engine/weapon';
import { createRng } from '@/engine/prng';

describe('tracking', () => {
  it('computes time-on-target and RMS', () => {
    const m = computeTrackingMetrics([
      { errorDeg: 0.2, radiusDeg: 1 },
      { errorDeg: 0.4, radiusDeg: 1 },
      { errorDeg: 3, radiusDeg: 1 },
    ]);
    expect(m.timeOnTargetPct).toBeCloseTo(66.67, 1);
    expect(m.rmsErrorDeg).toBeCloseTo(Math.sqrt((0.04 + 0.16 + 9) / 3), 5);
    expect(m.samples).toBe(3);
  });

  it('empty samples → zeros', () => {
    expect(computeTrackingMetrics([])).toMatchObject({ timeOnTargetPct: 0, samples: 0 });
  });
});

describe('heatmap', () => {
  it('labels systematic low bias', () => {
    const h = buildHeatmap([
      { dxR: 0.1, dyR: -1.2 },
      { dxR: -0.2, dyR: -1.5 },
      { dxR: 0.3, dyR: -0.9 },
    ]);
    expect(h.biasLabel).toBe('low');
    expect(h.total).toBe(3);
    expect(h.grid.flat().reduce((a, b) => a + (b ?? 0), 0)).toBe(3);
  });

  it('empty → centered', () => {
    expect(buildHeatmap([]).biasLabel).toBe('centered');
  });
});

describe('rating', () => {
  it('elite score → Master/Grandmaster, average → Gold-ish', () => {
    expect(rateScore(950, 'gridshot').tier).toMatch(/Master|Grandmaster/);
    expect(rateScore(620, 'gridshot').tier).toBe('Gold');
    expect(rateScore(200, 'gridshot').tier).toBe('Bronze');
  });

  it('tier thresholds', () => {
    expect(tierForPercentile(99.5)).toBe('Grandmaster');
    expect(tierForPercentile(96)).toBe('Master');
    expect(tierForPercentile(50)).toBe('Gold');
  });
});

describe('replay', () => {
  it('round-trips through JSON and rejects garbage', () => {
    const r = createReplay('seed-1', 'gridshot');
    recordEvent(r, { tMs: 100, yawRad: 0.1, pitchRad: 0, trigger: true });
    const back = deserializeReplay(serializeReplay(r));
    expect(back.seed).toBe('seed-1');
    expect(back.events).toHaveLength(1);
    expect(() => deserializeReplay('{"version":2}')).toThrow();
  });
});

describe('pool', () => {
  it('never allocates on miss; tracks counts', () => {
    const p = createPool(2, (i) => ({ i }));
    const a = p.acquire();
    const b = p.acquire();
    expect(p.acquire()).toBeNull();
    expect(p.usedCount).toBe(2);
    expect(p.capacity).toBe(2);
    if (a) p.release(a);
    expect(p.freeCount).toBe(1);
    expect(b).not.toBeNull();
  });

  it('clear() frees everything; over-release is ignored', () => {
    const p = createPool(2, (i) => ({ i }));
    const a = p.acquire();
    p.clear();
    expect(p.freeCount).toBe(2);
    expect(p.usedCount).toBe(0);
    if (a) p.release(a); // pool already full → ignored
    if (a) p.release(a);
    expect(p.freeCount).toBe(2);
  });
});

describe('weapon', () => {
  const profile = {
    fireMode: 'click',
    rpm: 600,
    recoilDeg: 0,
    spreadDeg: 0,
    magazine: 2,
    reloadMs: 500,
  } as const;
  it('semi-auto needs a fresh press edge; unpressed → no fire', () => {
    const st = createWeaponState({ ...profile });
    expect(tryTrigger({ ...profile }, st, 900, false, 900).fired).toBe(false);
    expect(tryTrigger({ ...profile }, st, 1000, true, 1000).fired).toBe(true);
    expect(tryTrigger({ ...profile }, st, 1100, true, 1000).fired).toBe(false);
    expect(tryTrigger({ ...profile }, st, 1200, true, 1200).fired).toBe(true);
  });

  it('empty magazine triggers reload window', () => {
    const st = createWeaponState({ ...profile });
    tryTrigger({ ...profile }, st, 1000, true, 1000);
    tryTrigger({ ...profile }, st, 1200, true, 1200);
    const r = tryTrigger({ ...profile }, st, 1300, true, 1300);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe('reloading');
  });

  it('zero ammo outside reload window reports empty', () => {
    const st = createWeaponState({ ...profile });
    st.ammo = 0;
    st.reloadingUntilMs = -1;
    const r = tryTrigger({ ...profile }, st, 5000, true, 5000);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('unlimited ammo never enters a reload window', () => {
    const p = { ...profile, unlimitedAmmo: true };
    const st = createWeaponState(p);
    for (let i = 0; i < 50; i++) {
      expect(tryTrigger(p, st, 1000 + i * 100, true, 1000 + i * 100).fired).toBe(true);
    }
    expect(st.ammo).toBe(Infinity);
    expect(st.reloadingUntilMs).toBe(-1);
  });

  it('updateWeapon recovers recoil and refills after reload', () => {
    const p = { ...profile, magazine: 1, reloadMs: 200, recoilDeg: 1 };
    const st = createWeaponState(p);
    expect(tryTrigger(p, st, 1000, true, 1000).fired).toBe(true);
    expect(st.recoilPitchRad).toBeGreaterThan(0);
    updateWeapon(p, st, 1100, 0.5);
    expect(st.recoilPitchRad).toBeCloseTo(0, 1);
    updateWeapon(p, st, 1300, 0.016);
    expect(st.ammo).toBe(1);
  });

  it('rollSpreadRad is zero when spread is 0, bounded otherwise', () => {
    expect(rollSpreadRad(0, createRng(1))).toEqual({ yaw: 0, pitch: 0 });
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const s = rollSpreadRad(2, rng);
      expect(Math.hypot(s.yaw, s.pitch)).toBeLessThanOrEqual((2 * Math.PI) / 180 + 1e-9);
    }
  });
});
