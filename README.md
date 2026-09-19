# Aim Trainer — Esports Precision Training

Production-grade web aim trainer (Aim Lab / Kovaak's class). Three pillars:
**lowest input latency · measurement accuracy · actionable insights.**

```
pnpm i && pnpm dev        # → http://localhost:5173
pnpm typecheck && pnpm test:coverage && pnpm build
```

## Architecture

```
                +------------------ PRESENTATION (React) ------------------+
                | Menu · GameScreen(R3F Canvas) · HUD · Results · Dashboard |
                | Settings · CrosshairEditor · ConsentBanner · MobileBlock  |
                +---------------------------+------------------------------+
                                            | 10Hz HUD poll (refs only —
                                            | zero setState in hot path)
                +---------------------------v------------------------------+
                | SIMULATION (framework-agnostic, deterministic)            |
                | InputManager(pointerlock+coalesced) → FixedLoop(240Hz)    |
                | → Simulation(seed, mulberry32) → Weapon → ShotEvents      |
                +---------------------------+------------------------------+
                                            | per-shot telemetry
                +---------------------------v------------------------------+
                | ANALYTICS (pure fns, worker-aggregated)                   |
                | scoring · stats · flick · tracking · heatmap · rating     |
                | insights · replay(seed+inputs) → Dexie (offline-first)    |
                +-----------------------------------------------------------+
```

- `src/engine/` — core loop, input, raycast, pooling. No React imports. Unit-tested.
- `src/scenarios/` — Zod schema + 9 built-ins + adapter to engine config.
- `src/analytics/` — pure functions, 100% unit covered.
- `src/persistence/` — Dexie (IndexedDB) repos + optional sync stub.
- `src/ui/` — React components, Zustand store (UI state only), i18n (EN/TH).
- `src/workers/` — analytics aggregation off main thread.

## Scoring formula

```
acc      = hits / shots
speedIdx = clamp(killsPerSec / 4, 0..1)        # 4 KPS ≈ elite gridshot pace
precIdx  = clamp(1 - medianErrDeg / 5, 0..1)
base     = (wAcc·acc + wSpd·speedIdx + wPrec·precIdx) / Σw
difficulty = 1 + 0.15·(count-1)/4 + sizeBonus(≤0.25) + speedBonus(≤0.25)
score    = round(1000 · base · difficulty)
```

Tracking modes substitute time-on-target fraction for the trigger stream (see
`GameScreen.finishRun`). Skill rating maps score → z-score vs per-mode baseline →
percentile → Bronze…Grandmaster (see `src/analytics/rating.ts`).

## Key controls & settings

- Sensitivity is stored as **cm/360** (source of truth); converters for Valorant /
  CS2 / Apex / Overwatch / Fortnite live in `src/engine/sensitivity.ts`.
- Crosshair editor with live preview + Valorant-style code import.
- Export results as CSV / JSON from Results or Dashboard.

## Known limitations

- Safari: Pointer Lock needs macOS 16+; iOS Safari touch aiming intentionally unsupported.
- `input-to-photon` in the HUD is a modeled estimate (see `engine/telemetry.ts`).
- See `DECISIONS.md` for ADRs and `docs/SENSITIVITY.md` for converter constants.
