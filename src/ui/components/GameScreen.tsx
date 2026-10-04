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
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { ArenaEnvironment } from './ArenaEnvironment';
import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { targetBaseColor, targetContrastScale } from '../arenaThemes';
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
import { scenarioText } from '../scenarioText';
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
  streak: number;
  /** Visual-only kill bursts (ring buffer; never touches sim state or RNG). */
  bursts: Burst[];
  burstIdx: number;
  bestStreak: number;
  /** Pre-roll left (ms) after the first lock; sim + clock are frozen until 0. */
  countdownMs: number;
  simTargets: TargetState[];
  seed: string;
  over: boolean;
}

const COUNTDOWN_MS = 3000;
const BURST_POOL = 16;
const BURST_MS = 380;
const SHARDS = 8;

interface Burst {
  x: number;
  y: number;
  z: number;
  radius: number;
  t0: number;
}

/** Shard directions: cube corners, normalised. Fixed table — no RNG, no allocation per kill. */
const K = 1 / Math.sqrt(3); // unit-length cube diagonal
const SHARD_DIRS: readonly (readonly [number, number, number])[] = [
  [K, K, K],
  [-K, K, K],
  [K, -K, K],
  [-K, -K, K],
  [K, K, -K],
  [-K, K, -K],
  [K, -K, -K],
  [-K, -K, -K],
];

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mulberrySeed(): string {
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function CameraRig({ run }: { run: React.RefObject<RunRefs | null> }): null {
  const { camera } = useThree();
  useFrame(() => {
    const r = run.current;
    if (!r) return;
    const aim = r.input.getAim();
    camera.rotation.order = 'YXZ';
    camera.rotation.y = aim.yawRad;
    // Keep the aim camera stable; recoil belongs to the weapon viewmodel only.
    camera.rotation.x = aim.pitchRad;
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
  run: React.RefObject<RunRefs | null>;
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

/**
 * Auto quality: after a warm-up (shader compile, texture upload) take the median frame time over
 * ~120 frames; if it is below ~45 fps, ask for one step down (reflections, then bloom).
 * Median, not mean, so a tab-switch hitch never triggers it.
 */
function QualityGuard({ enabled, onDegrade }: { enabled: boolean; onDegrade: () => void }): null {
  const clock = useRef(0);
  const samples = useRef<number[]>([]);
  useFrame((_, dt) => {
    if (!enabled) return;
    clock.current += dt;
    if (clock.current < 2.5) return;
    samples.current.push(dt);
    if (samples.current.length < 120) return;
    const sorted = [...samples.current].sort((a, b) => a - b);
    samples.current = [];
    clock.current = 0;
    if ((sorted[60] ?? 0) > 1 / 45) onDegrade();
  });
  return null;
}

function BurstField({ run }: { run: React.RefObject<RunRefs | null> }): ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    const r = run.current;
    if (!mesh || !r) return;
    const now = performance.now();
    for (let b = 0; b < BURST_POOL; b++) {
      const burst = r.bursts[b] as Burst;
      const p = (now - burst.t0) / BURST_MS;
      const live = p >= 0 && p < 1;
      const ease = 1 - (1 - p) * (1 - p);
      for (let k = 0; k < SHARDS; k++) {
        const d = SHARD_DIRS[k] as readonly [number, number, number];
        if (live) {
          const dist = burst.radius * (1 + 3.2 * ease);
          dummy.position.set(burst.x + d[0] * dist, burst.y + d[1] * dist, burst.z + d[2] * dist);
          dummy.scale.setScalar(Math.max(0.001, burst.radius * 0.32 * (1 - p)));
        } else {
          dummy.position.set(0, 0, 9999);
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(b * SHARDS + k, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, BURST_POOL * SHARDS]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color="#a9c6ff" toneMapped={false} />
    </instancedMesh>
  );
}

function WeaponModel({
  run,
  visible,
}: {
  run: React.RefObject<RunRefs | null>;
  visible: boolean;
}): null | ReactElement {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const muzzleFlash = useRef<THREE.Group>(null);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const rawWeapon = useLoader(OBJLoader, '/models/usp45.obj');
  // Five shared materials; every OBJ sub-mesh is baked into one merged mesh per material
  // (the pistol is ~5 draw calls instead of one per OBJ part, and no per-part materials).
  const weaponAsset = useMemo(() => {
    const mats = {
      trigger: new THREE.MeshStandardMaterial({
        color: '#ff4655',
        metalness: 0.3,
        roughness: 0.38,
      }),
      barrel: new THREE.MeshStandardMaterial({ color: '#182640', metalness: 0.92, roughness: 0.2 }),
      slide: new THREE.MeshStandardMaterial({
        color: '#3b527c',
        emissive: '#0b1730',
        emissiveIntensity: 0.5,
        metalness: 0.78,
        roughness: 0.28,
      }),
      frame: new THREE.MeshStandardMaterial({
        color: '#253a60',
        emissive: '#081326',
        emissiveIntensity: 0.55,
        metalness: 0.5,
        roughness: 0.5,
      }),
      body: new THREE.MeshStandardMaterial({
        color: '#1b2d4e',
        emissive: '#071227',
        emissiveIntensity: 0.65,
        metalness: 0.42,
        roughness: 0.68,
      }),
    };
    type Slot = keyof typeof mats;
    const buckets: Record<Slot, THREE.BufferGeometry[]> = {
      trigger: [],
      barrel: [],
      slide: [],
      frame: [],
      body: [],
    };
    const root = rawWeapon.clone(true);
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name.toLowerCase();
      const slot: Slot = name.includes('trigger')
        ? 'trigger'
        : name.includes('barrel')
          ? 'barrel'
          : name.includes('slider')
            ? 'slide'
            : name.includes('frame')
              ? 'frame'
              : 'body';
      const geo = (child.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(child.matrixWorld);
      // Same attribute set across parts or the merge fails.
      for (const key of Object.keys(geo.attributes)) {
        if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      buckets[slot].push(geo.index ? geo.toNonIndexed() : geo);
    });
    const out = new THREE.Group();
    for (const slot of Object.keys(buckets) as Slot[]) {
      const parts = buckets[slot];
      if (parts.length === 0) continue;
      const merged = mergeGeometries(parts, false) as THREE.BufferGeometry | null; // null on attribute mismatch
      if (merged) out.add(new THREE.Mesh(merged, mats[slot]));
    }
    return out;
  }, [rawWeapon]);

  useFrame((_, delta) => {
    const weapon = group.current;
    if (!weapon) return;
    const recoil = run.current?.weapon.recoilPitchRad ?? 0;
    localOffset.set(0.35 + recoil * 0.035, -0.6 + recoil * 0.16, -0.86 + recoil * 0.1);
    targetPosition.copy(localOffset).applyQuaternion(camera.quaternion).add(camera.position);
    targetQuaternion.copy(camera.quaternion);
    const follow = 1 - Math.exp(-24 * delta);
    weapon.position.lerp(targetPosition, follow);
    weapon.quaternion.slerp(targetQuaternion, follow);
    if (model.current) {
      const kick = Math.min(0.19, recoil * 10);
      model.current.rotation.x = 0.08 + kick;
      model.current.position.y = kick * 0.08;
      model.current.position.z = kick * 0.35;
    }
    const flashStrength = Math.min(1, recoil * 70);
    if (muzzleFlash.current) {
      muzzleFlash.current.visible = flashStrength > 0.05;
      muzzleFlash.current.position.y = 0.26 + flashStrength * 0.012;
      muzzleFlash.current.position.z = -0.41 + flashStrength * 0.018;
    }
  });

  return (
    <group ref={group} visible={visible}>
      <group ref={model} rotation={[0.08, -Math.PI / 2 - 0.04, 0.02]} scale={0.08}>
        <primitive object={weaponAsset} />
      </group>
      {/* OBJ barrel tip: source x=-4.9, source y≈2.4 → scene y≈0.26, z≈-0.41. */}
      <group ref={muzzleFlash} position={[0, 0.26, -0.41]} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.58, 1, 0.58]}>
          <coneGeometry args={[0.05, 0.22, 6]} />
          <meshBasicMaterial color="#ff8a6a" toneMapped={false} transparent opacity={0.86} />
        </mesh>
      </group>
    </group>
  );
}

export function GameScreen(): ReactElement {
  const { t } = useTranslation();
  const scenario = useApp((s) => s.scenario());
  const text = scenarioText(t, scenario);
  const runId = useApp((s) => s.runId);
  const sens = useApp((s) => s.sens);
  const video = useApp((s) => s.video);
  const crosshair = useApp((s) => s.crosshair);
  const hitSound = useApp((s) => s.hitSound);
  const colorblind = useApp((s) => s.colorblind);
  const masterVolume = useApp((s) => s.masterVolume);
  const hitVolume = useApp((s) => s.hitVolume);
  const setResult = useApp((s) => s.setResult);
  const setView = useApp((s) => s.setView);

  const [locked, setLocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Auto-quality step (session only): 0 full, 1 no reflections, 2 no bloom.
  const [degrade, setDegrade] = useState(0);
  const [hud, setHud] = useState({
    kills: 0,
    shots: 0,
    timeLeft: scenario.durationSec,
    fps: 0,
    itp: 0,
    streak: 0,
    countdown: 0,
  });

  const wrapRef = useRef<HTMLDivElement>(null);
  const run = useRef<RunRefs | null>(null);
  const replayRef = useRef(createReplay('', ''));
  const hudLast = useRef(0);

  // (Re)build the run when runId changes.
  useEffect(() => {
    const seed = mulberrySeed();
    const cfg = scenarioToSpawnConfig(scenario);
    // Drills measure aim, not reload discipline: keep firing available forever.
    const gameplayWeapon = {
      ...cfg.weapon,
      // Viewmodel-only kick: drills with a zeroed profile still communicate each shot.
      recoilDeg: Math.max(cfg.weapon.recoilDeg, 1.2),
      unlimitedAmmo: true,
    };
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
      onKill: (t) => {
        const r = run.current;
        if (!r || REDUCED_MOTION) return;
        const b = r.bursts[r.burstIdx % BURST_POOL] as Burst;
        r.burstIdx += 1;
        b.x = t.position.x;
        b.y = t.position.y;
        b.z = t.position.z;
        b.radius = t.radius;
        b.t0 = performance.now();
      },
      onShot: (s) => {
        const r = run.current;
        shots.push(s);
        if (s.hit) {
          if (r && s.killed) {
            r.kills += 1;
            r.streak += 1;
            r.bestStreak = Math.max(r.bestStreak, r.streak);
          }
          // Hit confirmation rises ~a semitone-ish per streak step (capped) — misses stay silent.
          soundBank.play(hitSound, 1 + Math.min(r?.streak ?? 0, 12) * 0.03);
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
            r.streak = 0;
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
    const weapon = createWeaponState(gameplayWeapon);
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
      streak: 0,
      bursts: Array.from({ length: BURST_POOL }, () => ({ x: 0, y: 0, z: 0, radius: 0, t0: -1e9 })),
      burstIdx: 0,
      bestStreak: 0,
      countdownMs: COUNTDOWN_MS,
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
        step: (dtSec) => {
          const r = run.current;
          if (!r || r.over) return;
          if (!input.isLocked()) return; // paused when pointer unlocked
          if (r.countdownMs > 0) {
            r.countdownMs = Math.max(0, r.countdownMs - dtSec * 1000);
            return;
          }
          // Play clock = sim time: it only advances while locked and after the
          // pre-roll, so briefing/pause time never eats into the run.
          const simTimeMs = sim.time;
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

          updateWeapon(gameplayWeapon, r.weapon, simTimeMs, dtSec);

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
          if (r.holding && gameplayWeapon.fireMode === 'auto') {
            const res = tryTrigger(gameplayWeapon, r.weapon, simTimeMs, true, r.holdSinceMs);
            if (res.fired) {
              const sp = rollSpreadRad(cfg.weapon.spreadDeg, rng);
              sim.fire(simTimeMs, aim.yawRad, aim.pitchRad, sp.yaw, sp.pitch);
              recordEvent(replayRef.current, {
                tMs: simTimeMs,
                yawRad: aim.yawRad,
                pitchRad: aim.pitchRad,
                trigger: true,
              });
              soundBank.playShot();
            }
          }
          sim.step(dtMs);

          if (sim.time >= endAtMs) {
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
              streak: r.streak,
              countdown: Math.ceil(r.countdownMs / 1000),
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
          params: i.params,
          severity: i.severity,
        })),
      });
    }

    const onDown = (e: MouseEvent): void => {
      const r = run.current;
      if (!r || !input.isLocked() || r.over || r.countdownMs > 0) return;
      if (e.button !== 0) return;
      const simTimeMs = sim.time;
      r.holding = true;
      r.holdSinceMs = simTimeMs;
      const aimNow = input.getAim();
      const res = tryTrigger(gameplayWeapon, r.weapon, simTimeMs, true, r.holdSinceMs);
      if (res.fired) {
        const sp = rollSpreadRad(cfg.weapon.spreadDeg, rng);
        sim.fire(simTimeMs, aimNow.yawRad, aimNow.pitchRad, sp.yaw, sp.pitch);
        recordEvent(replayRef.current, {
          tMs: simTimeMs,
          yawRad: aimNow.yawRad,
          pitchRad: aimNow.pitchRad,
          trigger: true,
        });
        soundBank.playShot();
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
  const targetColor = useMemo(() => {
    const c = new THREE.Color(targetBaseColor(colorblind));
    c.multiplyScalar(targetContrastScale(video.contrast));
    return `#${c.getHexString()}`;
  }, [colorblind, video.contrast]);

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none overflow-hidden bg-abyss">
      <Canvas
        // With post-processing on, the composer owns MSAA (multisampling below): enabling it
        // on the canvas too would pay for anti-aliasing twice.
        gl={{ antialias: video.antialias && !video.bloom, powerPreference: 'high-performance' }}
        dpr={video.resolutionScale}
        camera={{ fov: video.fov, near: 0.1, far: 600, position: [0, 0, 0] }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.setAttribute('aria-label', 'Aim training arena');
          // Dev/test only: lets perf scripts read renderer.info (stripped from production builds).
          if (import.meta.env.DEV) (window as Window & { __aimGl?: typeof gl }).__aimGl = gl;
        }}
      >
        {/* Enclosed training hall: sized from the scenario's spawn volume so the
            target lane is never occluded and nothing floats. */}
        <ArenaEnvironment
          scenario={scenario}
          mapTheme={video.mapTheme}
          brightness={video.brightness}
          reflections={video.reflections && degrade < 1}
        />
        <QualityGuard
          enabled={video.autoQuality && degrade < 2}
          onDegrade={() => setDegrade((n) => Math.min(2, n + 1))}
        />
        <CameraRig run={run} />
        <BurstField run={run} />
        <WeaponModel run={run} visible={!paused} />
        {/* Targets stay range-blue by default — decoupled from crosshair color so the
            sight (white) always reads against the target. Colorblind palettes and the
            contrast setting only retint them. */}
        <TargetField
          run={run}
          maxTargets={Math.min(64, scenario.targetCount * 2 + 8)}
          color={targetColor}
        />
        {video.bloom && (
          // Only genuinely bright emissives (lamps, edge strips, muzzle flash) pass the
          // threshold; targets and the dark lane stay untouched.
          <EffectComposer multisampling={video.antialias ? 4 : 0}>
            {degrade < 2 ? (
              <Bloom
                mipmapBlur
                intensity={0.65}
                luminanceThreshold={0.5}
                luminanceSmoothing={0.2}
              />
            ) : (
              <></>
            )}
            <Vignette offset={0.32} darkness={0.5} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
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
          <span className="text-faint">{t('kills')} </span>
          <span className="font-bold text-brand-soft tnum">{hud.kills}</span>
        </div>
        <div className="rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5">
          <span className="text-faint">{t('time')} </span>
          <span className="font-bold text-ink tnum">{hud.timeLeft}s</span>
        </div>
        <div className="rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5">
          <span className="text-faint">{t('shots')} </span>
          <span className="font-bold text-ink tnum">{hud.shots}</span>
        </div>
        {hud.streak >= 3 && (
          <div className="rounded-md border border-brand/60 bg-abyss/80 px-3 py-1.5">
            <span className="text-faint">{t('streak')} </span>
            <span className="font-bold text-brand-soft tnum">{hud.streak}</span>
          </div>
        )}
      </div>
      <div
        className="absolute right-4 top-4 rounded-md border border-linesoft bg-abyss/80 px-3 py-1.5 font-mono text-xs text-mist tnum"
        role="status"
        aria-label="telemetry"
      >
        {hud.fps} FPS · ITP ~{hud.itp.toFixed(1)}ms
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[11px] uppercase tracking-wider text-faint">
        {text.title} · {scenario.durationSec}s · {t('escPauses')}
        {degrade > 0 && <span className="ml-3 text-warn">{t('autoLow')}</span>}
      </div>

      {locked && hud.countdown > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          role="status"
          aria-live="assertive"
        >
          <span className="font-display text-8xl font-bold text-brand-soft tnum">
            {hud.countdown}
          </span>
        </div>
      )}

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
            {text.title}
          </span>
          <span className="max-w-md text-sm text-mist">{text.description}</span>
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
            {t('pausedResume')}
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
        {t('quit')}
      </button>
    </div>
  );
}
