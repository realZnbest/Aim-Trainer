import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { angularErrorDeg, raycastCenter } from '@/engine/raycast';
import { Telemetry } from '@/engine/telemetry';
import { createFixedLoop } from '@/engine/loop';
import { SoundBank } from '@/engine/audio';

describe('raycast', () => {
  it('angular error is ~0 dead-ahead, ~180 behind', () => {
    const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    cam.position.set(0, 0, 0);
    cam.lookAt(new THREE.Vector3(0, 0, -10));
    cam.updateMatrixWorld();
    expect(angularErrorDeg(cam, new THREE.Vector3(0, 0, -10))).toBeCloseTo(0, 3);
    expect(angularErrorDeg(cam, new THREE.Vector3(0, 0, 10))).toBeCloseTo(180, 0);
  });

  it('center raycast returns empty for empty scene', () => {
    const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    expect(raycastCenter(cam, [])).toEqual([]);
  });
});

describe('telemetry', () => {
  it('tracks fps and estimates input-to-photon', () => {
    const t = new Telemetry();
    let now = 1000;
    for (let i = 0; i < 60; i++) {
      now += 1000 / 144;
      t.frame(now);
    }
    const s = t.snapshot();
    expect(s.fps).toBeCloseTo(144, 0);
    expect(s.inputToPhotonMs).toBeGreaterThan(s.avgMs);
    expect(s.p1LowFps).toBeGreaterThan(0);
    t.reset();
    expect(t.snapshot().fps).toBe(0);
  });
});

describe('fixed loop', () => {
  it('advances sim time and stops', async () => {
    let steps = 0;
    let renders = 0;
    const loop = createFixedLoop(
      {
        step: () => steps++,
        render: () => renders++,
      },
      240,
    );
    expect(loop.simTimeMs).toBe(0);
    loop.start();
    await new Promise((r) => setTimeout(r, 80));
    loop.stop();
    const simMs = loop.simTimeMs;
    expect(steps).toBeGreaterThan(0);
    expect(renders).toBeGreaterThan(0);
    expect(simMs).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(loop.simTimeMs).toBe(simMs); // stopped: no advance
  });
});

describe('audio', () => {
  it('play() without init is a safe no-op', () => {
    const bank = new SoundBank();
    expect(() => bank.play('click')).not.toThrow();
    bank.setVolumes(0.5, 0.5);
    expect(() => bank.play('beep')).not.toThrow();
  });
});
