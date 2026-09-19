/**
 * Game screen: owns the hot path.
 *
 * Architecture (latency-first):
 * - `InputManager` consumes raw movementX/Y + getCoalescedEvents() — zero smoothing.
 * - `createFixedLoop` ticks `Simulation` at 240Hz; R3F renders presentation.
 * - Hit registration uses sim aim at the shot timestamp (performance.now-based).
 * - React state is NEVER touched in the loop; HUD polls a mutable ref at ~10Hz.
 * - React Three Fiber renders targets from a shared mutable array via instancedMesh.
 *
 * @module ui/components/GameScreen
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import {
  InputManager,
  Simulation,
  Telemetry,
  createFixedLoop,
  createWeaponState,
  tryTrigger,
  updateWeapon,
  rollSpreadRad,
  soundBank,
  type ShotEvent,
  type TargetState,
} from '@/engine';
import { createRng } from '@/engine/prng';
import { scenarioToSpawnConfig } from '@/scenarios/adapters';
import {
  aggregateFlicks,
  analyzeFlick,
  buildHeatmap,
  computeScore,
  computeTrackingMetrics,
  detectWeaknesses,
  median,
  rateScore,
  summarize,
  type FlickVerdict,
  type TrackingSample,
} from '@/analytics';
import type { CrosshairPathPoint } from '@/engine/types';
import { createReplay, recordEvent } from '@/analytics/replay';
import { saveSession } from '@/persistence/db';

const RAD2DEG = 180 / Math.PI;

/** Mutable per-run bundle — never in React state. */
interface RunRefs {
  sim: Simulation;
  input: InputManager;
  telemetry: Telemetry;
  weapon: ReturnType<typeof createWeaponState>;
  shots: ShotEvent[];
  reactions: number[];
  errors: number[];
  tracking: TrackingSample[];
  misses: { dxR: number; dyR: number }[];
  flicks: FlickVerdict[];
  path: CrosshairPathPoint[];
  aimAtSpawn: Map<number, { yaw: number; pitch: number; tMs: number }>;
  holding: boolean;
  holdSinceMs: number;
  pressedEdge: boolean;
  kills: number;
  simTargets: TargetState[];
  seed: string;
  over: boolean;
}

function mulberrySeed(): string {
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function CameraRig({ run }: { run: React.MutableRefObject<RunRefs | null> }): null {
  const { camera } = useThree();
  useFrame(() => {
    const r = run.current;
    if (!r) return;
    const aim = r.input.getAim();
    camera.rotation.order = 'YXZ';
    camera.rotation.y = aim.yawRad;
    // Visual recoil only (presentation); sim fire uses raw aim + rolled spread.
    camera.rotation.x = aim.pitchRad + r.weapon.recoilPitchRad;
    camera.rotation.z = 0;
  });
  return null;
}

function TargetField({
  run,
  maxTargets,
  color,
}: {
  run: React.MutableRefObject<RunRefs | null>;
  maxTargets: number;
  color: string;
}): ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    const r = run.current;
    if (!mesh || !r) return;
    const list = r.sim.collectActive(r.simTargets);
    for (let i = 0; i < maxTargets; i++) {
      const t = list[i];
      if (t) {
        dummy.position.set(t.position.x, t.position.y, t.position.z);
        dummy.scale.setScalar(Math.max(0.001, t.radius));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.position.set(0, 0, 9999);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxTargets]} frustumCulled={false}>
      <sphereGeometry args={[1, 20, 14]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

export function GameScreen(): ReactElement {
  const { t } = useTranslation();
  const scenario = useApp((s) => s.scenario());
  const runId = useApp((s) => s.runId);
  const sens = useApp((s) => s.sens);
  const video = useApp((s) => s.video);
  const crosshair = useApp((s) => s.crosshair);
  const hitSound = useApp((s) => s.hitSound);
  const masterVolume = useApp((s) => s.masterVolume);
  const hitVolume = useApp((s) => s.hitVolume);
  const setResult = useApp((s) => s.setResult);
  const setView = useApp((s) => s.setView);

  const [locked, setLocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({
    kills: 0,
    shots: 0,
    timeLeft: scenario.durationSec,
    fps: 0,
    itp: 0,
  });
  const [hitmark, setHitmark] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const run = useRef<RunRefs | null>(null);
  const replayRef = useRef(createReplay('', ''));
  const hudLast = useRef(0);

  // (Re)build the run when runId changes.
  useEffect(() => {
    const seed = mulberrySeed();
    const cfg = scenarioToSpawnConfig(scenario);
    const rng = createRng(`${seed}:spread`);
    const shots: ShotEvent[] = [];
    const reactions: number[] = [];
    const errors: number[] = [];
    const tracking: TrackingSample[] = [];
    const misses: { dxR: number; dyR: number }[] = [];
    const flicks: FlickVerdict[] = [];
    const path: CrosshairPathPoint[] = [];
    const aimAtSpawn = new Map<number, { yaw: number; pitch: number; tMs: number }>();

    const sim = new Simulation(cfg, seed, {
      onShot: (s) => {
        const r = run.current;
        shots.push(s);
        if (s.hit) {
          if (r) r.kills += s.killed ? 1 : 0;
          if (s.reactionMs != null) reactions.push(s.reactionMs);
          errors.push(s.errorDeg);
          // Flick analysis from crosshair path slice
          if (r && s.killed && s.targetId != null) {
            const spawn = r.aimAtSpawn.get(s.targetId) ?? {
              yaw: r.input.getAim().yawRad,
              pitch: r.input.getAim().pitchRad,
              tMs: s.tMs - (s.reactionMs ?? 200),
            };
            const slice = r.path.filter((p) => p.tMs >= spawn.tMs - 1 && p.tMs <= s.tMs);
            if (slice.length >= 2) {
              const first = slice[0] as CrosshairPathPoint;
              // Ideal: angular distance from aim-at-spawn to target — approx via reaction path length
              const dyaw = slice.reduce(
                (m, p) => Math.max(m, Math.abs(p.yawRad - first.yawRad)),
                0,
              );
              const dpitch = slice.reduce(
                (m, p) => Math.max(m, Math.abs(p.pitchRad - first.pitchRad)),
                0,
              );
              const idealDeg = Math.max(0.5, Math.hypot(dyaw, dpitch) * RAD2DEG);
              flicks.push(
                analyzeFlick({
                  idealDeg,
                  path: slice,
                  targetYaw: slice[slice.length - 1]?.yawRad ?? first.yawRad,
                  targetPitch: slice[slice.length - 1]?.pitchRad ?? first.pitchRad,
                }),
              );
            }
          }
        } else {
          // Miss heatmap: offset to nearest active target in radii
          if (r) {
            const aim = r.input.getAim();
            let best: TargetState | null = null;
            let bestAng = Infinity;
            let bestYawOff = 0;
            let bestPitchOff = 0;
            for (const target of r.simTargets) {
              if (!target.active) continue;
              const dx = target.position.x;
              const dy = target.position.y;
              const dz = target.position.z;
              const dist = Math.hypot(dx, dy, dz);
              const tyaw = Math.atan2(-dx, -dz);
              const tpitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
              let dYaw = tyaw - aim.yawRad;
              while (dYaw > Math.PI) dYaw -= Math.PI * 2;
              while (dYaw < -Math.PI) dYaw += Math.PI * 2;
              const dPitch = tpitch - aim.pitchRad;
              const ang = Math.hypot(dYaw, dPitch) * RAD2DEG;
              if (ang < bestAng) {
                bestAng = ang;
                best = target;
                bestYawOff = dYaw * RAD2DEG;
                bestPitchOff = dPitch * RAD2DEG;
              }
            }
            if (best) {
              const dist = Math.hypot(best.position.x, best.position.y, best.position.z);
              const rDeg = (Math.asin(Math.min(1, best.radius / dist)) * 180) / Math.PI || 1;
              misses.push({ dxR: bestYawOff / rDeg, dyR: bestPitchOff / rDeg });
            }
          }
        }
      },
    });

    const input = new InputManager({
      cm360: sens.cm360,
      dpi: sens.dpi,
      multX: sens.multX,
      multY: sens.multY,
      invertY: sens.invertY,
    });
    const weapon = createWeaponState(cfg.weapon);
    run.current = {
      sim,
      input,
      telemetry: new Telemetry(),
      weapon,
      shots,
      reactions,
      errors,
      tracking,
      misses,
      flicks,
      path,
      aimAtSpawn,
      holding: false,
      holdSinceMs: -1,
      pressedEdge: false,
      kills: 0,
      simTargets: [],
      seed,
      over: false,
    };
    replayRef.current = createReplay(seed, scenario.id);
    if (wrapRef.current) {
      input.attach(wrapRef.current, {
        onLockChange: (isLocked) => {
          setLocked(isLocked);
          setPaused(false);
          if (!isLocked) setPaused(true);
        },
        onError: (msg) => setLockError(msg),
      });
    }
    soundBank.ensure();
    soundBank.setVolumes(masterVolume, hitVolume);

    const endAtMs = scenario.durationSec * 1000;
    const loop = createFixedLoop(
      {
        step: (dtSec, simTimeMs) => {
          const r = run.current;
          if (!r || r.over) return;
          if (!input.isLocked()) return; // paused when pointer unlocked
          const dtMs = dtSec * 1000;
          // Track aim-at-spawn for newly visible targets
          const actives = sim.collectActive(r.simTargets);
          const aim = input.getAim();
          for (const target of actives) {
            if (!r.aimAtSpawn.has(target.id)) {
              r.aimAtSpawn.set(target.id, { yaw: aim.yawRad, pitch: aim.pitchRad, tMs: simTimeMs });
            }
          }
          // Crosshair path (for flick analysis + replay), capped
          r.path.push({ tMs: simTimeMs, yawRad: aim.yawRad, pitchRad: aim.pitchRad });
          if (r.path.length > 4000) r.path.splice(0, r.path.length - 4000);

          updateWeapon(cfg.weapon, r.weapon, simTimeMs, dtSec);

          // Tracking sample every tick
          if (
            scenario.mode === 'tracking' ||
            scenario.mode === 'strafe-track' ||
            scenario.mode === 'custom'
          ) {
            const firstTarget = actives[0];
            if (firstTarget) {
              const dx = firstTarget.position.x;
              const dy = firstTarget.position.y;
              const dz = firstTarget.position.z;
              const dist = Math.hypot(dx, dy, dz);
              const fx = -Math.sin(aim.yawRad) * Math.cos(aim.pitchRad);
              const fy = Math.sin(aim.pitchRad);
              const fz = -Math.cos(aim.yawRad) * Math.cos(aim.pitchRad);
              const dot = Math.max(-1, Math.min(1, (fx * dx + fy * dy + fz * dz) / dist));
              const err = (Math.acos(dot) * 180) / Math.PI;
              const radius = (Math.asin(Math.min(1, firstTarget.radius / dist)) * 180) / Math.PI;
              tracking.push({ errorDeg: err, radiusDeg: radius });
            }
          }

          // Auto fire while held
          if (r.holding && cfg.weapon.fireMode === 'auto') {
            const res = tryTrigger(cfg.weapon, r.weapon, simTimeMs, true, r.holdSinceMs);
            if (res.fired) {
              const sp = rollSpreadRad(cfg.weapon.spreadDeg, rng);
              sim.fire(simTimeMs, aim.yawRad, aim.pitchRad, sp.yaw, sp.pitch);
              recordEvent(replayRef.current, {
                tMs: simTimeMs,
                yawRad: aim.yawRad,
                pitchRad: aim.pitchRad,
                trigger: true,
              });
              soundBank.play(hitSound);
              setHitmark((h) => h + 1);
            }
          }

          sim.step(dtMs);

          if (simTimeMs >= endAtMs) {
            r.over = true;
            void finishRun();
          }
        },
        render: (_alpha, _frameMs) => {
          const r = run.current;
          if (!r) return;
          const now = performance.now();
          const tele = r.telemetry.frame(now);
          if (now - hudLast.current > 100) {
            hudLast.current = now;
            setHud({
              kills: r.kills,
              shots: r.shots.length,
              timeLeft: Math.max(0, Math.ceil((endAtMs - sim.time) / 1000)),
              fps: Math.round(tele.fps),
              itp: tele.inputToPhotonMs,
            });
          }
        },
      },
      240,
    );
    loop.start();

    async function finishRun(): Promise<void> {
      const r = run.current;
      if (!r) return;
      loop.stop();
      input.exitLock();
      const hits = r.shots.filter((s) => s.hit).length;
      const kills = r.kills;
      const dur = scenario.durationSec;
      const reaction = summarize(r.reactions);
      const flickAgg = aggregateFlicks(r.flicks);
      const trackMetrics = r.tracking.length > 0 ? computeTrackingMetrics(r.tracking) : null;
      const heat = buildHeatmap(r.misses);
      const isTracking = scenario.mode === 'tracking' || scenario.mode === 'strafe-track';
      let score: ReturnType<typeof computeScore>;
      let accuracy: number;
      if (isTracking && trackMetrics) {
        const totFrac = trackMetrics.timeOnTargetPct / 100;
        const trigAcc = r.shots.length > 0 ? hits / r.shots.length : totFrac;
        accuracy = trigAcc;
        score = computeScore({
          hits: Math.round(totFrac * 100),
          shots: 100,
          kills: Math.round(totFrac * dur * 2),
          durationSec: dur,
          medianErrorDeg: trackMetrics.meanErrorDeg,
          avgTargetSize: (scenario.targetSize + scenario.targetSizeMax) / 2,
          avgTargetSpeed: (scenario.minSpeed + scenario.maxSpeed) / 2,
          targetCount: scenario.targetCount,
          weights: scenario.scoringWeights,
        });
      } else {
        accuracy = r.shots.length > 0 ? hits / r.shots.length : 0;
        score = computeScore({
          hits,
          shots: r.shots.length,
          kills,
          durationSec: dur,
          medianErrorDeg: median(r.errors),
          avgTargetSize: (scenario.targetSize + scenario.targetSizeMax) / 2,
          avgTargetSpeed: (scenario.minSpeed + scenario.maxSpeed) / 2,
          targetCount: scenario.targetCount,
          weights: scenario.scoringWeights,
        });
      }
      const rating = rateScore(score.score, scenario.mode);
      const insights = detectWeaknesses({
        accuracy,
        killsPerSec: score.killsPerSec,
        reaction,
        flick: flickAgg,
        tracking: trackMetrics,
        missBias: heat.biasLabel,
      });
      const session = {
        scenarioId: scenario.id,
        mode: scenario.mode,
        seed: r.seed,
        startedAt: new Date().toISOString(),
        durationSec: dur,
        score: score.score,
        accuracy,
        kills,
        shots: r.shots.length,
        hits,
        killsPerSec: score.killsPerSec,
        reactionMean: reaction.mean,
        reactionMedian: reaction.median,
        reactionP95: reaction.p95,
        reactionSd: reaction.sd,
        overshootRatio: flickAgg.overshootRatio,
        undershootRatio: flickAgg.undershootRatio,
        timeOnTargetPct: trackMetrics?.timeOnTargetPct ?? null,
        rmsErrorDeg: trackMetrics?.rmsErrorDeg ?? null,
        tier: rating.tier,
        percentile: rating.percentile,
        replayJson: JSON.stringify(replayRef.current),
        telemetryJson: JSON.stringify({ heatmap: heat, tracking: trackMetrics }),
      };
      try {
        await saveSession(session);
      } catch {
        // Offline-first: IndexedDB may be unavailable (private mode) — results still shown.
      }
      setResult({
        session,
        insights: insights.map((i) => ({
          id: i.id,
          title: i.title,
          detail: i.detail,
          severity: i.severity,
        })),
      });
    }

    const onDown = (e: MouseEvent): void => {
      const r = run.current;
      if (!r || !input.isLocked() || r.over) return;
      if (e.button !== 0) return;
      const simTimeMs = sim.time;
      r.holding = true;
      r.holdSinceMs = simTimeMs;
      const aimNow = input.getAim();
      const res = tryTrigger(cfg.weapon, r.weapon, simTimeMs, true, r.holdSinceMs);
      if (res.fired) {
        const sp = rollSpreadRad(cfg.weapon.spreadDeg, rng);
        sim.fire(simTimeMs, aimNow.yawRad, aimNow.pitchRad, sp.yaw, sp.pitch);
        recordEvent(replayRef.current, {
          tMs: simTimeMs,
          yawRad: aimNow.yawRad,
          pitchRad: aimNow.pitchRad,
          trigger: true,
        });
        soundBank.play(hitSound);
        setHitmark((h) => h + 1);
      }
    };
    const onUp = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      if (run.current) run.current.holding = false;
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      loop.stop();
      input.dispose();
      run.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const crossSize = crosshair.length + crosshair.gap;

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none overflow-hidden bg-bg">
      <Canvas
        gl={{ antialias: video.antialias, powerPreference: 'high-performance' }}
        dpr={video.resolutionScale}
        camera={{ fov: video.fov, near: 0.1, far: 200, position: [0, 0, 0] }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.setAttribute('aria-label', 'Aim training arena');
        }}
      >
        <color attach="background" args={['#0a0e14']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 2]} intensity={0.6} />
        <gridHelper args={[60, 30, '#1e293b', '#111827']} position={[0, -6, -15]} />
        <mesh position={[0, 0, -40]}>
          <planeGeometry args={[80, 40]} />
          <meshBasicMaterial color="#0d1320" toneMapped={false} />
        </mesh>
        <CameraRig run={run} />
        <TargetField
          run={run}
          maxTargets={Math.min(64, scenario.targetCount * 2 + 8)}
          color={crosshair.color}
        />
      </Canvas>

      {/* Crosshair overlay (DOM — cheap, no canvas redraw) */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <svg width="64" height="64" viewBox="0 0 64 64" opacity={crosshair.alpha}>
          {crosshair.outline && (
            <g stroke="#000" strokeWidth={crosshair.thickness + 2} opacity={0.8}>
              <line x1={32 - crossSize - 1} y1="32" x2={32 - crosshair.gap + 1} y2="32" />
              <line x1={32 + crosshair.gap - 1} y1="32" x2={32 + crossSize + 1} y2="32" />
              <line x1="32" y1={32 - crossSize - 1} x2="32" y2={32 - crosshair.gap + 1} />
              <line x1="32" y1={32 + crosshair.gap - 1} x2="32" y2={32 + crossSize + 1} />
            </g>
          )}
          <g stroke={crosshair.color} strokeWidth={crosshair.thickness}>
            <line x1={32 - crossSize} y1="32" x2={32 - crosshair.gap} y2="32" />
            <line x1={32 + crosshair.gap} y1="32" x2={32 + crossSize} y2="32" />
            <line x1="32" y1={32 - crossSize} x2="32" y2={32 - crosshair.gap} />
            <line x1="32" y1={32 + crosshair.gap} x2="32" y2={32 + crossSize} />
          </g>
          {crosshair.dot && (
            <circle cx="32" cy="32" r={crosshair.thickness / 1.5} fill={crosshair.color} />
          )}
        </svg>
      </div>

      {/* Hitmarker */}
      {hitmark > 0 && (
        <div
          key={hitmark}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <div className="h-8 w-8 animate-ping rounded-full border-2 border-white/70" />
        </div>
      )}

      {/* HUD */}
      <div
        className="absolute left-4 top-4 flex gap-4 text-sm"
        role="status"
        aria-label="match stats"
      >
        <div className="rounded bg-black/60 px-3 py-1.5">
          <span className="opacity-60">Kills </span>
          <span className="font-bold text-cyan-300">{hud.kills}</span>
        </div>
        <div className="rounded bg-black/60 px-3 py-1.5">
          <span className="opacity-60">Time </span>
          <span className="font-bold">{hud.timeLeft}s</span>
        </div>
        <div className="rounded bg-black/60 px-3 py-1.5">
          <span className="opacity-60">Shots </span>
          <span className="font-bold">{hud.shots}</span>
        </div>
      </div>
      <div
        className="absolute right-4 top-4 rounded bg-black/60 px-3 py-1.5 text-xs"
        role="status"
        aria-label="telemetry"
      >
        {hud.fps} FPS · ITP ~{hud.itp.toFixed(1)}ms
      </div>
      <div className="absolute bottom-4 left-4 text-xs opacity-60">
        {scenario.title} · {t('seconds')}: {scenario.durationSec} · ESC pauses
      </div>

      {/* Pointer-lock overlay */}
      {!locked && !paused && (
        <button
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70"
          onClick={() => {
            setLockError(null);
            soundBank.ensure();
            void run.current?.input.requestLock();
          }}
        >
          <span className="text-xl font-bold">{t('clickToLock')}</span>
          <span className="text-sm opacity-70">
            {scenario.title} — {scenario.description}
          </span>
          {lockError && <span className="max-w-md text-sm text-rose-400">{lockError}</span>}
        </button>
      )}
      {paused && !locked && (
        <button
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70"
          onClick={() => {
            setLockError(null);
            void run.current?.input.requestLock();
          }}
        >
          <span className="text-xl font-bold">Paused — click to resume</span>
        </button>
      )}

      <button
        className="absolute bottom-4 right-4 z-20 rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
        onClick={() => {
          run.current = null;
          setView('menu');
        }}
      >
        Quit (ESC)
      </button>
    </div>
  );
}
