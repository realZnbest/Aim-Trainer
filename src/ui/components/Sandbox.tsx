import { useMemo, useState, type ReactElement } from 'react';
import { useApp } from '../store';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import { parseScenario, validateScenario, type Scenario } from '@/scenarios/schema';
import { Button, Card, ReticleMark } from './primitives';
import { Check, Num, Row, Select } from './fields';

/**
 * Sandbox editor: author a drill in-game. Every field maps 1:1 to the Scenario
 * Schema; the draft is validated live with Zod and only a valid scenario can
 * start. No engine changes needed — the scenario JSON IS the mode.
 */

const SHAPES = ['sphere', 'capsule', 'plane'] as const;
const VOLUMES = ['box', 'sphere', 'cone'] as const;
const PATTERNS = ['grid', 'random', 'sequence', 'pairs', 'switch'] as const;
const MOVEMENTS = ['static', 'linear', 'sine', 'random-walk', 'strafe-ai'] as const;
const FIRE_MODES = ['click', 'auto'] as const;

const sandboxBuiltin = BUILT_IN_SCENARIOS.find((s) => s.id === 'sandbox');
if (!sandboxBuiltin) throw new Error('missing sandbox builtin');

function freshDraft(): Scenario {
  // parseScenario fills schema defaults and returns a true output Scenario.
  return parseScenario({ ...sandboxBuiltin, id: 'sandbox-custom', title: 'My Drill' });
}

function Section({ title, children }: { title: string; children: React.ReactNode }): ReactElement {
  return (
    <Card>
      <h2 className="font-display font-semibold uppercase tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

export function Sandbox(): ReactElement {
  const setView = useApp((s) => s.setView);
  const startCustom = useApp((s) => s.startCustom);
  const [draft, setDraft] = useState<Scenario>(freshDraft);

  const patch = (p: Partial<Scenario>): void => setDraft((d) => ({ ...d, ...p }));
  const validation = useMemo(() => validateScenario(draft), [draft]);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ReticleMark size={30} />
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
              Sandbox editor
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-faint">
              {validation.ok ? 'valid scenario' : `${String(validation.errors.length)} problems`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft(freshDraft())}>
            Reset
          </Button>
          <Button variant="ghost" onClick={() => setView('menu')}>
            Back to menu
          </Button>
        </div>
      </header>

      {!validation.ok && (
        <div
          role="alert"
          className="mb-3 rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
        >
          <ul className="list-disc pl-5">
            {validation.errors.map((e) => (
              <li key={e} className="font-mono text-xs">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section title="Basics">
          <Row label="Title">
            <input
              aria-label="drill title"
              className="field w-48"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Row>
          <Row label="Duration (s)">
            <Num
              aria="duration"
              value={draft.durationSec}
              min={5}
              max={1800}
              step={5}
              onChange={(v) => patch({ durationSec: Math.round(v) })}
            />
          </Row>
          <Row label="Mode tag">
            <Select
              aria="mode tag"
              value={draft.mode}
              onChange={(v) => patch({ mode: v as Scenario['mode'] })}
              options={[
                'gridshot',
                'spidershot',
                'microshot',
                'tracking',
                'switching',
                'reflex',
                'strafe-track',
                'target-switching-speed',
                'custom',
              ]}
            />
          </Row>
        </Section>

        <Section title="Targets">
          <Row label="Size min (m)">
            <Num
              aria="size min"
              value={draft.targetSize}
              min={0.05}
              max={2}
              step={0.01}
              onChange={(v) => patch({ targetSize: v })}
            />
          </Row>
          <Row label="Size max (m)">
            <Num
              aria="size max"
              value={draft.targetSizeMax}
              min={0.05}
              max={2}
              step={0.01}
              onChange={(v) => patch({ targetSizeMax: v })}
            />
          </Row>
          <Row label="Shape">
            <Select
              aria="shape"
              value={draft.targetShape}
              onChange={(v) => patch({ targetShape: v as Scenario['targetShape'] })}
              options={SHAPES}
            />
          </Row>
          <Row label="Count">
            <Num
              aria="count"
              value={draft.targetCount}
              min={1}
              max={64}
              step={1}
              onChange={(v) => patch({ targetCount: Math.round(v) })}
            />
          </Row>
          <Row label="Lifetime ms (0 = until killed)">
            <Num
              aria="lifetime"
              value={draft.targetLifetimeMs}
              min={0}
              max={60000}
              step={100}
              onChange={(v) => patch({ targetLifetimeMs: Math.round(v) })}
            />
          </Row>
          <Row label="Health (999 + auto = tracking)">
            <Num
              aria="health"
              value={draft.health}
              min={1}
              max={1000}
              step={1}
              onChange={(v) => patch({ health: Math.round(v) })}
            />
          </Row>
        </Section>

        <Section title="Spawn area">
          <Row label="Volume">
            <Select
              aria="volume"
              value={draft.spawnArea.volume}
              onChange={(v) =>
                patch({
                  spawnArea: { ...draft.spawnArea, volume: v as Scenario['spawnArea']['volume'] },
                })
              }
              options={VOLUMES}
            />
          </Row>
          <Row label="Min distance (m)">
            <Num
              aria="min distance"
              value={draft.spawnArea.minDistance}
              min={2}
              max={60}
              step={1}
              onChange={(v) => patch({ spawnArea: { ...draft.spawnArea, minDistance: v } })}
            />
          </Row>
          <Row label="Max distance (m)">
            <Num
              aria="max distance"
              value={draft.spawnArea.maxDistance}
              min={2}
              max={120}
              step={1}
              onChange={(v) => patch({ spawnArea: { ...draft.spawnArea, maxDistance: v } })}
            />
          </Row>
          {draft.spawnArea.volume === 'box' && (
            <>
              <Row label="Half-width X">
                <Num
                  aria="half x"
                  value={draft.spawnArea.halfExtents?.x ?? 6}
                  min={1}
                  max={20}
                  step={0.5}
                  onChange={(v) =>
                    patch({
                      spawnArea: {
                        ...draft.spawnArea,
                        halfExtents: {
                          x: v,
                          y: draft.spawnArea.halfExtents?.y ?? 4,
                          z: draft.spawnArea.halfExtents?.z ?? 0.5,
                        },
                      },
                    })
                  }
                />
              </Row>
              <Row label="Half-height Y">
                <Num
                  aria="half y"
                  value={draft.spawnArea.halfExtents?.y ?? 4}
                  min={1}
                  max={15}
                  step={0.5}
                  onChange={(v) =>
                    patch({
                      spawnArea: {
                        ...draft.spawnArea,
                        halfExtents: {
                          x: draft.spawnArea.halfExtents?.x ?? 6,
                          y: v,
                          z: draft.spawnArea.halfExtents?.z ?? 0.5,
                        },
                      },
                    })
                  }
                />
              </Row>
            </>
          )}
          {draft.spawnArea.volume === 'sphere' && (
            <Row label="Radius">
              <Num
                aria="radius"
                value={draft.spawnArea.radius ?? 5}
                min={1}
                max={20}
                step={0.5}
                onChange={(v) => patch({ spawnArea: { ...draft.spawnArea, radius: v } })}
              />
            </Row>
          )}
          {draft.spawnArea.volume === 'cone' && (
            <Row label="Cone half-angle°">
              <Num
                aria="cone angle"
                value={draft.spawnArea.coneHalfAngleDeg ?? 14}
                min={1}
                max={60}
                step={1}
                onChange={(v) => patch({ spawnArea: { ...draft.spawnArea, coneHalfAngleDeg: v } })}
              />
            </Row>
          )}
          <Row label="Pattern">
            <Select
              aria="pattern"
              value={draft.spawnPattern}
              onChange={(v) => patch({ spawnPattern: v as Scenario['spawnPattern'] })}
              options={PATTERNS}
            />
          </Row>
          {draft.spawnPattern === 'grid' && (
            <>
              <Row label="Grid cols">
                <Num
                  aria="grid cols"
                  value={draft.gridCols ?? 3}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(v) => patch({ gridCols: Math.round(v) })}
                />
              </Row>
              <Row label="Grid rows">
                <Num
                  aria="grid rows"
                  value={draft.gridRows ?? 3}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(v) => patch({ gridRows: Math.round(v) })}
                />
              </Row>
            </>
          )}
          <Row label="Silent gap min ms (reflex)">
            <Num
              aria="gap min"
              value={draft.spawnDelayMinMs ?? 0}
              min={0}
              max={10000}
              step={100}
              onChange={(v) => patch({ spawnDelayMinMs: Math.round(v) })}
            />
          </Row>
          <Row label="Silent gap max ms">
            <Num
              aria="gap max"
              value={draft.spawnDelayMaxMs ?? 0}
              min={0}
              max={10000}
              step={100}
              onChange={(v) => patch({ spawnDelayMaxMs: Math.round(v) })}
            />
          </Row>
        </Section>

        <Section title="Movement">
          <Row label="Profile">
            <Select
              aria="movement"
              value={draft.movementProfile}
              onChange={(v) => patch({ movementProfile: v as Scenario['movementProfile'] })}
              options={MOVEMENTS}
            />
          </Row>
          <Row label="Min speed (m/s)">
            <Num
              aria="min speed"
              value={draft.minSpeed}
              min={0}
              max={60}
              step={0.5}
              onChange={(v) => patch({ minSpeed: v })}
            />
          </Row>
          <Row label="Max speed (m/s)">
            <Num
              aria="max speed"
              value={draft.maxSpeed}
              min={0}
              max={60}
              step={0.5}
              onChange={(v) => patch({ maxSpeed: v })}
            />
          </Row>
        </Section>

        <Section title="Weapon">
          <Row label="Fire mode">
            <Select
              aria="fire mode"
              value={draft.weapon.fireMode}
              onChange={(v) =>
                patch({
                  weapon: { ...draft.weapon, fireMode: v as Scenario['weapon']['fireMode'] },
                })
              }
              options={FIRE_MODES}
            />
          </Row>
          <Row label="RPM">
            <Num
              aria="rpm"
              value={draft.weapon.rpm}
              min={30}
              max={1200}
              step={10}
              onChange={(v) => patch({ weapon: { ...draft.weapon, rpm: Math.round(v) } })}
            />
          </Row>
          <Row label="Spread°">
            <Num
              aria="spread"
              value={draft.weapon.spreadDeg}
              min={0}
              max={5}
              step={0.1}
              onChange={(v) => patch({ weapon: { ...draft.weapon, spreadDeg: v } })}
            />
          </Row>
          <Row label="Recoil°">
            <Num
              aria="recoil"
              value={draft.weapon.recoilDeg}
              min={0}
              max={5}
              step={0.1}
              onChange={(v) => patch({ weapon: { ...draft.weapon, recoilDeg: v } })}
            />
          </Row>
          <Row label="Magazine">
            <Num
              aria="magazine"
              value={draft.weapon.magazine}
              min={1}
              max={1000}
              step={1}
              onChange={(v) => patch({ weapon: { ...draft.weapon, magazine: Math.round(v) } })}
            />
          </Row>
          <Row label="Reload ms">
            <Num
              aria="reload"
              value={draft.weapon.reloadMs}
              min={0}
              max={10000}
              step={100}
              onChange={(v) => patch({ weapon: { ...draft.weapon, reloadMs: Math.round(v) } })}
            />
          </Row>
        </Section>

        <Section title="Scoring + difficulty">
          <Row label="Weight accuracy">
            <Num
              aria="w acc"
              value={draft.scoringWeights.accuracy}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => patch({ scoringWeights: { ...draft.scoringWeights, accuracy: v } })}
            />
          </Row>
          <Row label="Weight speed">
            <Num
              aria="w speed"
              value={draft.scoringWeights.speed}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => patch({ scoringWeights: { ...draft.scoringWeights, speed: v } })}
            />
          </Row>
          <Row label="Weight precision">
            <Num
              aria="w prec"
              value={draft.scoringWeights.precision}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => patch({ scoringWeights: { ...draft.scoringWeights, precision: v } })}
            />
          </Row>
          <Row label="Adaptive difficulty">
            <Check
              aria="adaptive"
              checked={draft.difficultyScaling.enabled}
              onChange={(v) =>
                patch({ difficultyScaling: { ...draft.difficultyScaling, enabled: v } })
              }
            />
          </Row>
        </Section>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={() => {
            if (validation.ok) startCustom(validation.value);
          }}
          ariaLabel="start custom drill"
        >
          Start drill →
        </Button>
      </div>
      {!validation.ok && (
        <p className="mt-2 text-right text-xs text-danger">Fix the problems above to start.</p>
      )}
    </div>
  );
}
