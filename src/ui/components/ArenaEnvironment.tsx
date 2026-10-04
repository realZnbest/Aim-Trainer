/**
 * Arena router: shared lighting + one-shot environment map, then one of four maps.
 *
 * Gameplay contract (every map, see `maps/`):
 * - The lane from the camera to every possible target position is NEVER occluded.
 *   `computeDims` derives the clear zone from the scenario (spawn volume + movement
 *   drift + target radius); props live outside it (sides, behind, far away).
 * - The wall / sky directly behind the targets is bare: no panels, lights or props.
 * - Static geometry only (instanced where repeated); no per-frame updates besides the
 *   optional planar floor reflection.
 *
 * @module ui/components/ArenaEnvironment
 */
import { useMemo, type ReactElement } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import type { Scenario } from '@/scenarios/schema';
import { ARENA_THEMES, type MapTheme } from '../arenaThemes';
import { computeDims, type ArenaDims } from './maps/dims';
import { RangeMap } from './maps/RangeMap';
import { HangarMap } from './maps/HangarMap';
import { RooftopMap } from './maps/RooftopMap';
import { VoidMap } from './maps/VoidMap';

export { computeDims };
export type { ArenaDims };

function fogRange(map: MapTheme, maxD: number): [number, number] {
  switch (map) {
    case 'rooftop':
      return [maxD + 30, 480];
    case 'void':
      return [maxD + 40, 700];
    default:
      return [maxD + 14, maxD + 170];
  }
}

export function ArenaEnvironment({
  scenario,
  mapTheme = 'range',
  brightness = 1,
}: {
  scenario: Scenario;
  mapTheme?: MapTheme;
  brightness?: number;
}): ReactElement {
  const d = useMemo(() => computeDims(scenario), [scenario]);
  const theme = ARENA_THEMES[mapTheme];
  const [fogNear, fogFar] = fogRange(mapTheme, d.maxD);

  return (
    <group>
      <color attach="background" args={[theme.fog]} />
      <fog attach="fog" args={[theme.fog, fogNear, fogFar]} />
      <ambientLight intensity={theme.ambient * brightness} />
      <directionalLight position={[5, 8, 2]} intensity={1.1 * brightness} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, 0.55 * brightness]} />
      {/* Procedural, one-shot environment map: reflections on metal + the weapon
          without any network fetch. Lightformers sit off the target lane. */}
      <Environment resolution={64} frames={1} environmentIntensity={0.55 * brightness}>
        <Lightformer
          form="rect"
          intensity={3}
          color={theme.envLight}
          position={[0, 9, -6]}
          rotation-x={Math.PI / 2}
          scale={[24, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          color={theme.envAccent}
          position={[-14, 2, -4]}
          rotation-y={Math.PI / 2}
          scale={[18, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          color={theme.envAccent}
          position={[14, 2, -4]}
          rotation-y={-Math.PI / 2}
          scale={[18, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color={theme.envLight}
          position={[0, 3, 8]}
          scale={[16, 5, 1]}
        />
      </Environment>

      {mapTheme === 'range' && <RangeMap d={d} theme={theme} />}
      {mapTheme === 'hangar' && <HangarMap d={d} theme={theme} />}
      {mapTheme === 'rooftop' && <RooftopMap d={d} theme={theme} />}
      {mapTheme === 'void' && <VoidMap d={d} theme={theme} />}
    </group>
  );
}
