import { describe, expect, it, vi, afterEach } from 'vitest';
import { InputManager, pollGamepadAim } from '@/engine/input';

describe('InputManager', () => {
  it('full-turn delta equals 2π rad (no accel, no smoothing)', () => {
    const im = new InputManager({ cm360: 30, dpi: 800, multX: 1, multY: 1, invertY: false });
    const pxPer360 = (30 / 2.54) * 800;
    im.applyDelta(pxPer360, 0);
    // mouse right (dx>0) → yaw decreases by 2π
    expect(im.getAim().yawRad).toBeCloseTo(-Math.PI * 2, 6);
  });

  it('per-axis multipliers scale rotation', () => {
    const a = new InputManager({ cm360: 30, dpi: 800, multX: 1, multY: 1, invertY: false });
    const b = new InputManager({ cm360: 30, dpi: 800, multX: 2, multY: 1, invertY: false });
    a.applyDelta(100, 0);
    b.applyDelta(100, 0);
    expect(b.getAim().yawRad).toBeCloseTo(a.getAim().yawRad * 2, 9);
  });

  it('invert-Y flips pitch sign; pitch clamps at ±89.9°', () => {
    const std = new InputManager({ cm360: 30, dpi: 800, invertY: false });
    const inv = new InputManager({ cm360: 30, dpi: 800, invertY: true });
    std.applyDelta(0, 500);
    inv.applyDelta(0, 500);
    expect(inv.getAim().pitchRad).toBeCloseTo(-std.getAim().pitchRad, 9);
    const big = new InputManager({ cm360: 30, dpi: 800 });
    big.applyDelta(0, 1e7);
    expect(big.getAim().pitchRad).toBeLessThanOrEqual((89.9 * Math.PI) / 180);
    const drained = big.drainPending();
    expect(drained.dy).toBe(1e7);
    expect(big.drainPending().dy).toBe(0);
  });

  it('setAim clamps; calibration round-trips', () => {
    const im = new InputManager();
    im.setAim(1, 10);
    expect(im.getAim().pitchRad).toBeCloseTo((89.9 * Math.PI) / 180, 9);
    im.setCalibration({ cm360: 45 });
    expect(im.getCalibration().cm360).toBe(45);
    expect(im.isLocked()).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pollGamepadAim turns with deflected stick (dead-zone + curve)', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => [{ connected: true, axes: [0, 0, 1, -0.5] }],
    });
    const out = pollGamepadAim({ yawRad: 0, pitchRad: 0 }, 1);
    expect(out.yawRad).toBeLessThan(0);
    expect(out.pitchRad).toBeGreaterThan(0);
  });

  it('pollGamepadAim is identity with no gamepad', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    const aim = { yawRad: 0.5, pitchRad: 0.1 };
    expect(pollGamepadAim(aim, 0.016)).toEqual(aim);
  });
});
