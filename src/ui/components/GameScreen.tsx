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
  dormantColor = '#1d2a4a',
}: {
  run: React.MutableRefObject<RunRefs | null>;
  maxTargets: number;
  color: string;
  dormantColor?: string;
}): ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
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
        // Live duel targets burn blue; dormant ones sink into the range.
        mesh.setColorAt(i, tmpColor.set(t.dormant ? dormantColor : color));
      } else {
        dummy.position.set(0, 0, 9999);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tmpColor.set('#000000'));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxTargets]} frustumCulled={false}>
      <sphereGeometry args={[1, 20, 14]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

function WeaponModel({
  run,
  visible,
}: {
  run: React.MutableRefObject<RunRefs | null>;
  visible: boolean;
}): null | ReactElement {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const weapon = group.current;
    if (!weapon) return;
    const recoil = run.current?.weapon.recoilPitchRad ?? 0;
    localOffset.set(0.26 + recoil * 0.035, -0.36 + recoil * 0.16, -0.82 + recoil * 0.1);
    targetPosition.copy(localOffset).applyQuaternion(camera.quaternion).add(camera.position);
    targetQuaternion.copy(camera.quaternion);
    const follow = 1 - Math.exp(-24 * delta);
    weapon.position.lerp(targetPosition, follow);
    weapon.quaternion.slerp(targetQuaternion, follow);
  });

  return (
    <group ref={group} visible={visible}>
      <pointLight position={[-0.3, 0.35, 0.45]} intensity={0.35} distance={3} color="#b7c7e6" />
      <group rotation={[0.08, -0.04, 0.02]} scale={0.68}>
        {/* Slide and barrel */}
        <mesh castShadow position={[0, 0.04, -0.12]}>
          <boxGeometry args={[0.34, 0.13, 0.56]} />
          <meshStandardMaterial color="#2d4268" metalness={0.72} roughness={0.32} />
        </mesh>
        <mesh castShadow position={[0, 0.04, -0.47]}>
          <boxGeometry args={[0.24, 0.1, 0.22]} />
          <meshStandardMaterial color="#253a60" metalness={0.8} roughness={0.28} />
        </mesh>
        <mesh castShadow position={[0, 0.04, -0.64]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.072, 0.072, 0.13, 12]} />
          <meshStandardMaterial color="#070c17" metalness={0.92} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.04, -0.715]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.008, 12]} />
          <meshBasicMaterial color="#04070e" />
        </mesh>

        {/* Frame and trigger guard */}
        <mesh castShadow position={[0, -0.055, 0.13]}>
          <boxGeometry args={[0.37, 0.12, 0.42]} />
          <meshStandardMaterial color="#294064" metalness={0.48} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.12, -0.02]}>
          <boxGeometry args={[0.22, 0.035, 0.18]} />
          <meshStandardMaterial color="#0e1628" metalness={0.35} roughness={0.62} />
        </mesh>
        <mesh position={[-0.095, -0.145, -0.02]}>
          <boxGeometry args={[0.035, 0.13, 0.18]} />
          <meshStandardMaterial color="#0e1628" metalness={0.35} roughness={0.62} />
        </mesh>
        <mesh position={[0.095, -0.145, -0.02]}>
          <boxGeometry args={[0.035, 0.13, 0.18]} />
          <meshStandardMaterial color="#0e1628" metalness={0.35} roughness={0.62} />
        </mesh>
        <mesh position={[0, -0.13, -0.055]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.035, 0.09, 0.025]} />
          <meshStandardMaterial color="#ff4655" metalness={0.2} roughness={0.42} />
        </mesh>

        {/* Grip, magazine plate, and range markings */}
        <mesh castShadow position={[0, -0.28, 0.26]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[0.22, 0.43, 0.22]} />
          <meshStandardMaterial color="#1b2d4e" metalness={0.38} roughness={0.72} />
        </mesh>
        <mesh position={[0, -0.5, 0.3]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[0.23, 0.035, 0.23]} />
          <meshStandardMaterial color="#22304e" metalness={0.55} roughness={0.45} />
        </mesh>
        <mesh position={[0.114, -0.28, 0.255]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[0.012, 0.28, 0.08]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[-0.114, -0.28, 0.255]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[0.012, 0.28, 0.08]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.35} roughness={0.5} />
        </mesh>

        {/* Front sight and a restrained shot flash */}
        <mesh position={[0, 0.13, -0.27]}>
          <boxGeometry args={[0.035, 0.055, 0.1]} />
          <meshStandardMaterial color="#ff4655" metalness={0.25} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.04, -0.83]} rotation={[Math.PI / 2, 0, 0]} visible={(run.current?.weapon.recoilPitchRad ?? 0) > 0.018}>
          <coneGeometry args={[0.08, 0.2, 6]} />
          <meshBasicMaterial color="#ff4655" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function WeaponStatus({
  ammo,
  magazine,
  reloading,
  reloadProgress,
}: {
  ammo: number;
  magazine: number;
  reloading: boolean;
  reloadProgress: number;
}): ReactElement {
  const ammoRatio = magazine > 0 ? Math.max(0, Math.min(1, ammo / magazine)) : 0;

  return (
    <div
      className="weapon-status pointer-events-none absolute bottom-10 right-0 z-[5] w-[min(72vw,420px)] opacity-95"
      aria-label="weapon status"
    >
      <div className="mb-2 mr-5 ml-auto flex w-fit items-center gap-3 border border-linesoft bg-abyss/90 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist">
        <span className="text-faint">{reloading ? 'RELOAD' : 'SIDEARM'}</span>
        <span className={reloading ? 'text-steel' : ammo <= Math.max(3, magazine * 0.2) ? 'text-brand-soft' : 'text-ink'}>
          {reloading
            ? `${String(Math.round(reloadProgress * 100))}%`
            : `${ammo.toString().padStart(2, '0')} / ${String(magazine)}`}
        </span>
      </div>
      <div className="mr-5 ml-auto h-0.5 w-32 bg-linesoft">
        <div
          className="h-full bg-steel transition-[width] duration-100"
          style={{ width: `${String(reloading ? reloadProgress * 100 : ammoRatio * 100)}%` }}
        />
      </div>
    </div>
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
    ammo: scenario.weapon.magazine,
    magazine: scenario.weapon.magazine,
    reloading: false,
    reloadProgress: 0,
  });

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
              ammo: r.weapon.ammo,
              magazine: cfg.weapon.magazine,
              reloading: r.weapon.reloadingUntilMs > sim.time,
              reloadProgress:
                r.weapon.reloadingUntilMs > sim.time && cfg.weapon.reloadMs > 0
                  ? Math.max(0, Math.min(1, 1 - (r.weapon.reloadingUntilMs - sim.time) / cfg.weapon.reloadMs))
                  : 0,
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
    <div ref={wrapRef} className="relative h-full w-full select-none overflow-hidden bg-abyss">
      <Canvas
        gl={{ antialias: video.antialias, powerPreference: 'high-performance' }}
        dpr={video.resolutionScale}
        camera={{ fov: video.fov, near: 0.1, far: 200, position: [0, 0, 0] }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.setAttribute('aria-label', 'Aim training arena');
        }}
      >
        <color attach="background" args={['#04070e']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 2]} intensity={0.6} />
        <gridHelper args={[60, 30, '#2a3c66', '#101a33']} position={[0, -6, -15]} />
        <mesh position={[0, 0, -40]}>
          <planeGeometry args={[80, 40]} />
          <meshBasicMaterial color="#070d1d" toneMapped={false} />
        </mesh>
        <CameraRig run={run} />
        <WeaponModel run={run} visible={!paused} />
        {/* Targets stay range-blue (#3772A4) — decoupled from crosshair color
            so the sight (white) always reads against the target. */}
        <TargetField
          run={run}
          maxTargets={Math.min(64, scenario.targetCount * 2 + 8)}
          color="#3772A4"
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

      {/* HUD — instrument readouts: hairline chips, tabular numerals */}
      <div
        className="absolute left-4 top-4 flex gap-2 font-mono text-[13px]"
        role="status"
        aria-label="match stats"
      >
        <div className="rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5">
          <span className="text-faint">KILLS </span>
          <span className="font-bold text-brand-soft tnum">{hud.kills}</span>
        </div>
        <div className="rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5">
          <span className="text-faint">TIME </span>
          <span className="font-bold text-ink tnum">{hud.timeLeft}s</span>
        </div>
        <div className="rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5">
          <span className="text-faint">SHOTS </span>
          <span className="font-bold text-ink tnum">{hud.shots}</span>
        </div>
      </div>
      <div
        className="absolute right-4 top-4 rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5 font-mono text-xs text-mist tnum"
        role="status"
        aria-label="telemetry"
      >
        {hud.fps} FPS · ITP ~{hud.itp.toFixed(1)}ms
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[11px] uppercase tracking-wider text-faint">
        {scenario.title} · {scenario.durationSec}s · ESC pauses
      </div>

      <WeaponStatus
        ammo={hud.ammo}
        magazine={hud.magazine}
        reloading={hud.reloading}
        reloadProgress={hud.reloadProgress}
      />

      {/* Pointer-lock overlay — drill briefing card on the range */}
      {!locked && !paused && (
        <button
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-abyss/85 px-6 text-center"
          onClick={() => {
            setLockError(null);
            soundBank.ensure();
            void run.current?.input.requestLock();
          }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-steel">
            {scenario.id} · {scenario.durationSec}s
          </span>
          <span className="font-display text-3xl font-bold uppercase tracking-tight">
            {scenario.title}
          </span>
          <span className="max-w-md text-sm text-mist">{scenario.description}</span>
          <span className="rounded-lg bg-brand px-6 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-brand-ink">
            {t('clickToLock')}
          </span>
          {lockError && <span className="max-w-md text-sm text-danger">{lockError}</span>}
        </button>
      )}
      {paused && !locked && (
        <button
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-abyss/85"
          onClick={() => {
            setLockError(null);
            void run.current?.input.requestLock();
          }}
        >
          <span className="font-display text-2xl font-bold uppercase tracking-tight">
            Paused — click to resume
          </span>
        </button>
      )}

      <button
        className="absolute bottom-4 right-4 z-20 rounded-md border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-mist hover:bg-raised"
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
