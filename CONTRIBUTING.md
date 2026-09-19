# CONTRIBUTING.md

## Setup

```bash
pnpm i
pnpm dev        # http://localhost:5173
pnpm typecheck  # tsc --noEmit
pnpm lint
pnpm test       # vitest run
pnpm test:e2e   # playwright (starts dev server)
```

Conventional commits enforced (`feat:`, `fix:` …). Husky + lint-staged run
ESLint + Prettier on staged files.

## Scenario authoring guide (no engine changes needed)

1. Copy any entry from `src/scenarios/builtins.ts` (or write raw JSON).
2. Validate against `src/scenarios/schema.ts`:
   ```ts
   import { parseScenario } from '@/scenarios/schema';
   const s = parseScenario(json); // throws with readable issues
   ```
3. Key fields:
   - `targetSize`/`targetSizeMax` (meters, radius), `targetShape`
   - `spawnArea`: `box` (halfExtents + distance), `sphere` (radius), `cone` (half-angle)
   - `spawnPattern`: `grid` (needs `gridCols`/`gridRows`) | `random` | `sequence` | `pairs`
   - `movementProfile`: `static` | `linear` | `sine` | `random-walk` | `strafe-ai`
   - `weapon`: `fireMode` (`click` semi / `auto`), `rpm`, `spreadDeg`, `recoilDeg`, `magazine`, `reloadMs`
   - `targetLifetimeMs: 0` = lives until destroyed
   - `spawnDelayMinMs`/`spawnDelayMaxMs`: silent gap before a replacement spawns
     (reactive drills like Reflex — screen stays empty, then stimulus pops).
     `0` = instant refill (duels like Spidershot where a target is always up)
   - `health: 999` + `auto` weapon = tracking drill (time-on-target scoring)
   - `difficultyScaling`: adaptive size/speed every N seconds
4. Add to `BUILT_IN_SCENARIOS`, run `pnpm test` (built-ins self-validate in CI).

## Rules

- Never use `Math.random` in `engine/` or `analytics/` gameplay paths — use `createRng`.
- Never put hot-path state in Zustand/React state.
- Every public engine/analytics API needs TSDoc.
- Coverage gates: ≥90% lines/functions on `engine/` + `analytics/`.
