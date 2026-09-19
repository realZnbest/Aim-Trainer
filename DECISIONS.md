# DECISIONS.md — ADRs + assumptions

## D-01: cm/360 is the source of truth

All games convert through cm/360. Rationale: DPI- and game-independent, verifiable
against Mouse-Sensitivity.com. Assumption: published yaw constants (see docs/SENSITIVITY.md).

## D-02: Fixed 240Hz simulation decoupled from rAF

Logic ticks at 240Hz via accumulator; rendering interpolates. Hit registration uses
sim state at shot timestamp, never the drawn frame. Trade-off: 240Hz costs CPU with
100 targets (~measured <0.2ms/tick headless) — worth it for measurement accuracy.

## D-03: No smoothing / acceleration / buffering on input

Deltas from `movementX/Y` (+ `getCoalescedEvents()`) convert directly to yaw/pitch.
Any filter adds latency; rejected. Per-axis multipliers + invert-Y are pure gains.

## D-04: Analytic angular hit test is authoritative

`Simulation.fire()` uses angle(ray, target) ≤ angular radius — deterministic and
O(n). Mesh raycasting exists only for hover/debug. BVH hook (`three-mesh-bvh`) is
reserved for complex-mesh scenes; with ≤64 analytic spheres it would add cost with
zero benefit. Latency-first rule applied.

## D-05: Zero React state in the hot path

Zustand holds UI state only. Per-run data lives in a mutable ref bundle; HUD polls
at 10Hz. Object pools pre-allocate targets; no allocation per tick.

## D-06: mulberry32 everywhere in gameplay

`Math.random` is banned in sim/replay paths (only allowed for run-ID generation).
Verified by determinism test (same seed + inputs → identical shot stream).

## D-07: Score formula weights

4 KPS normalization ≈ elite gridshot pace; 5° precision floor ≈ worst useful error.
Difficulty bonuses capped (+0.65 max) so grinding tiny-target scenarios can't inflate
infinitely. Tracking modes score on time-on-target fraction instead of trigger KPS.

## D-08: Rating baselines are v1 placeholders

Mean/sd per mode are reference values, not measured population data. Replace with
real aggregates once telemetry volume exists (privacy-preserving, opt-in).

## D-09: Gridshot = quantized random cells

Grid pattern snaps spawns to 3×3 cells (deterministic via sim RNG), refilled to
`targetCount` concurrent targets — matches Gridshot feel while staying data-driven.

## D-10: No 3D particle system (yet)

Hit feedback = DOM hitmarker + pre-decoded Web Audio blip (<5ms). GPU particles
were cut for M1 to protect frame-time variance; pool slots reserved in engine.

## D-11: FPS cap is honored CPU-side

R3F drives GPU presentation (vsync-bound); `fpsCap` throttles sim-render/HUD work
and is persisted per profile. True GPU capping would need frameloop="never" +
manual `gl.render` — deferred to keep M1 stable.

## D-12: Offline-first, privacy-first

Dexie is the system of record. Cloud sync is an explicit stub (`syncSessions`) that
only runs when the user opts in. No PII collected; consent banner; Sentry hook is
opt-in via `window.__SENTRY_DSN__`.

## D-13: Mobile = notice, not hack

Touch aiming is deliberately not implemented; coarse-pointer devices get an
informative blocker (WCAG-friendly) instead of a compromised experience.

## D-14: Reflex ≠ Spidershot — the silent gap is the mechanic

Spidershot keeps a target always up (instant refill → acquisition + flick).
Reflex schedules each replacement after a seeded-random silent gap
(`spawnDelayMinMs/MaxMs`, 0.8–2.4s) with a short 1.5s lifetime, so
`reactionMs` measures true stimulus → response. The delay queue lives in the
sim (deterministic, replay-safe); omitting the fields preserves instant refill
for every other mode.
