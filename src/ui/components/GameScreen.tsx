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
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
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
  const model = useRef<THREE.Group>(null);
  const muzzleFlash = useRef<THREE.Group>(null);
  const muzzleLight = useRef<THREE.PointLight>(null);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const rawWeapon = useLoader(OBJLoader, '/models/usp45.obj');
  const weaponAsset = useMemo(() => {
    const asset = rawWeapon.clone(true);
    asset.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name.toLowerCase();
      const material = name.includes('trigger')
        ? new THREE.MeshStandardMaterial({
            color: '#ff4655',
            metalness: 0.3,
            roughness: 0.38,
          })
        : name.includes('barrel')
          ? new THREE.MeshStandardMaterial({
              color: '#182640',
              metalness: 0.92,
              roughness: 0.2,
            })
          : name.includes('slider')
            ? new THREE.MeshStandardMaterial({
                color: '#3b527c',
                emissive: '#0b1730',
                emissiveIntensity: 0.5,
                metalness: 0.78,
                roughness: 0.28,
              })
            : name.includes('frame')
              ? new THREE.MeshStandardMaterial({
                  color: '#253a60',
                  emissive: '#081326',
                  emissiveIntensity: 0.55,
                  metalness: 0.5,
                  roughness: 0.5,
                })
              : new THREE.MeshStandardMaterial({
                  color: '#1b2d4e',
                  emissive: '#071227',
                  emissiveIntensity: 0.65,
                  metalness: 0.42,
                  roughness: 0.68,
                });
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return asset;
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
    if (muzzleLight.current) muzzleLight.current.intensity = flashStrength * 3.8;
  });

  return (
    <group ref={group} visible={visible}>
      <pointLight position={[-0.3, 0.35, 0.45]} intensity={0.7} distance={4} color="#b7c7e6" />
      <group ref={model} rotation={[0.08, -Math.PI / 2 - 0.04, 0.02]} scale={0.08}>
        <primitive object={weaponAsset} />
      </group>
      {/* OBJ barrel tip: source x=-4.9, source y≈2.4 → scene y≈0.26, z≈-0.41. */}
      <group ref={muzzleFlash} position={[0, 0.26, -0.41]} visible={false}>
        <pointLight ref={muzzleLight} color="#ff9a78" intensity={0} distance={1.15} decay={2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.58, 1, 0.58]}>
          <coneGeometry args={[0.05, 0.22, 6]} />
          <meshBasicMaterial color="#ff8a6a" toneMapped={false} transparent opacity={0.86} />
        </mesh>
      </group>
      <group visible={false}>
        {/* Beveled slide: dark steel shell, raised top plane, and serrations. */}
        <RoundedBox args={[0.42, 0.15, 0.64]} radius={0.035} smoothness={2} castShadow position={[0, 0.055, -0.12]}>
          <meshStandardMaterial color="#2d4268" emissive="#0a1428" emissiveIntensity={0.7} metalness={0.78} roughness={0.3} />
        </RoundedBox>
        <RoundedBox args={[0.34, 0.055, 0.38]} radius={0.018} smoothness={2} castShadow position={[0, 0.145, -0.03]}>
          <meshStandardMaterial color="#3b527c" emissive="#0b1730" emissiveIntensity={0.65} metalness={0.72} roughness={0.27} />
        </RoundedBox>
        <RoundedBox args={[0.25, 0.1, 0.23]} radius={0.02} smoothness={2} castShadow position={[0, 0.055, -0.5]}>
          <meshStandardMaterial color="#253a60" metalness={0.86} roughness={0.23} />
        </RoundedBox>
        <mesh position={[0.218, 0.055, -0.2]}>
          <boxGeometry args={[0.012, 0.065, 0.23]} />
          <meshStandardMaterial color="#0e1628" metalness={0.35} roughness={0.64} />
        </mesh>
        {[-0.25, -0.2, -0.15, -0.1, -0.05].map((z) => (
          <mesh key={z} position={[0.224, 0.068, z]} rotation={[0, 0.12, 0]}>
            <boxGeometry args={[0.014, 0.07, 0.022]} />
            <meshStandardMaterial color="#6ea8ff" metalness={0.45} roughness={0.42} />
          </mesh>
        ))}

        {/* Barrel, crown, and bore. */}
        <mesh castShadow position={[0, 0.055, -0.64]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.072, 0.072, 0.16, 12]} />
          <meshStandardMaterial color="#070c17" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.055, -0.735]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.087, 0.087, 0.035, 12]} />
          <meshStandardMaterial color="#182640" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.055, -0.758]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.048, 0.048, 0.008, 12]} />
          <meshBasicMaterial color="#04070e" />
        </mesh>

        {/* Frame, dust cover, rail teeth, and trigger. */}
        <RoundedBox args={[0.45, 0.14, 0.45]} radius={0.04} smoothness={2} castShadow position={[0, -0.055, 0.12]}>
          <meshStandardMaterial color="#294064" emissive="#081326" emissiveIntensity={0.65} metalness={0.5} roughness={0.46} />
        </RoundedBox>
        <RoundedBox args={[0.27, 0.055, 0.27]} radius={0.014} smoothness={2} position={[0, -0.145, -0.08]}>
          <meshStandardMaterial color="#182640" metalness={0.55} roughness={0.42} />
        </RoundedBox>
        {[-0.17, -0.12, -0.07, -0.02].map((z) => (
          <mesh key={z} position={[0, -0.18, z]}>
            <boxGeometry args={[0.22, 0.018, 0.022]} />
            <meshStandardMaterial color="#6ea8ff" metalness={0.4} roughness={0.45} />
          </mesh>
        ))}
        <mesh position={[0, -0.13, -0.02]}>
          <torusGeometry args={[0.09, 0.017, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#0e1628" metalness={0.32} roughness={0.6} />
        </mesh>
        <RoundedBox args={[0.035, 0.095, 0.025]} radius={0.008} smoothness={2} position={[0, -0.135, -0.045]} rotation={[0.2, 0, 0]}>
          <meshStandardMaterial color="#ff4655" metalness={0.2} roughness={0.4} />
        </RoundedBox>

        {/* Grip with separate side panels, grooves, and magwell plate. */}
        <RoundedBox args={[0.25, 0.5, 0.25]} radius={0.035} smoothness={2} castShadow position={[0, -0.31, 0.27]} rotation={[-0.22, 0, 0]}>
          <meshStandardMaterial color="#1b2d4e" emissive="#071227" emissiveIntensity={0.8} metalness={0.4} roughness={0.7} />
        </RoundedBox>
        <RoundedBox args={[0.018, 0.34, 0.19]} radius={0.008} smoothness={2} position={[0.134, -0.3, 0.27]} rotation={[-0.22, 0, 0]}>
          <meshStandardMaterial color="#2d4268" metalness={0.5} roughness={0.58} />
        </RoundedBox>
        <RoundedBox args={[0.018, 0.34, 0.19]} radius={0.008} smoothness={2} position={[-0.134, -0.3, 0.27]} rotation={[-0.22, 0, 0]}>
          <meshStandardMaterial color="#2d4268" metalness={0.5} roughness={0.58} />
        </RoundedBox>
        {[0.18, 0.23, 0.28, 0.33, 0.38].map((y) => (
          <mesh key={y} position={[0.147, -y, 0.27]} rotation={[-0.22, 0, 0]}>
            <boxGeometry args={[0.012, 0.018, 0.17]} />
            <meshStandardMaterial color="#6ea8ff" metalness={0.35} roughness={0.5} />
          </mesh>
        ))}
        <RoundedBox args={[0.26, 0.04, 0.26]} radius={0.012} smoothness={2} position={[0, -0.54, 0.32]} rotation={[-0.22, 0, 0]}>
          <meshStandardMaterial color="#22304e" metalness={0.62} roughness={0.38} />
        </RoundedBox>

        {/* Rear sight, front sight, optic housing, and red lens. */}
        <RoundedBox args={[0.16, 0.07, 0.19]} radius={0.018} smoothness={2} position={[0, 0.18, 0.13]}>
          <meshStandardMaterial color="#0a1120" metalness={0.65} roughness={0.34} />
        </RoundedBox>
        <mesh position={[0, 0.19, 0.03]}>
          <boxGeometry args={[0.045, 0.018, 0.012]} />
          <meshBasicMaterial color="#ff4655" toneMapped={false} />
        </mesh>
        <mesh position={[-0.075, 0.18, 0.24]}>
          <boxGeometry args={[0.025, 0.07, 0.045]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[0.075, 0.18, 0.24]}>
          <boxGeometry args={[0.025, 0.07, 0.045]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.15, -0.3]}>
          <boxGeometry args={[0.04, 0.075, 0.08]} />
          <meshStandardMaterial color="#ff4655" metalness={0.25} roughness={0.38} />
        </mesh>

        {/* Two visible frame pins give the side profile a finished mechanical read. */}
        <mesh position={[0.23, -0.04, 0.12]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 0.012, 10]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.7} roughness={0.28} />
        </mesh>
        <mesh position={[0.23, -0.04, 0.24]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 10]} />
          <meshStandardMaterial color="#6ea8ff" metalness={0.7} roughness={0.28} />
        </mesh>

        {/* Restrained 3D shot flash. */}
        <mesh position={[0, 0.055, -0.88]} rotation={[Math.PI / 2, 0, 0]} visible={(run.current?.weapon.recoilPitchRad ?? 0) > 0.004}>
          <coneGeometry args={[0.08, 0.2, 6]} />
          <meshBasicMaterial color="#ff4655" toneMapped={false} />
        </mesh>
      </group>
    </group>
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
        <color attach="background" args={['#0b1426']} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[5, 8, 2]} intensity={1.1} />
        <gridHelper args={[60, 30, '#4a66a8', '#24365e']} position={[0, -6, -15]} />
        <mesh position={[0, 0, -40]}>
          <planeGeometry args={[80, 40]} />
          <meshBasicMaterial color="#12203f" toneMapped={false} />
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
