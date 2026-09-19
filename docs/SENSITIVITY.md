# Sensitivity conversion — constants & provenance

`cm/360` is the source of truth. All conversions derive from **degrees of yaw per
count at sensitivity 1.0** (`YAW_CONSTANTS_DEG` in `src/engine/sensitivity.ts`).

| Game         | yaw @ sens 1.0 (deg) | Source                                                                                                  |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Valorant     | 0.07                 | Riot-published sens scale; widely reproduced (e.g. 0.35 @ 800dpi ≈ 46.7cm/360 matches community tables) |
| CS2          | 0.022                | Source engine `m_yaw` 0.022; unchanged in CS2                                                           |
| Apex Legends | 0.022                | Source-derived engine, same `m_yaw`                                                                     |
| Overwatch 2  | 0.0066               | Back-derived from 106.26cm/360 @ 800dpi sens 1.0 (high-sens curve; verify in-game)                      |
| Fortnite     | 0.0095               | Slider-percent mapping approx at 100%; least precise — verify per season                                |

Formulas:

```
inches/360 = 360 / (sens × yaw × dpi)
cm/360     = inches/360 × 2.54
sens       = 360 / ((cm360/2.54) × yaw × dpi)
```

- Raw delta → radians: `revolutions = (px × mult / dpi × 2.54) / cm360`, `rad = rev × 2π`.
- No acceleration, no smoothing, no angle snapping — ever.
- FOV: vertical↔horizontal via aspect; cross-game FOV scaling uses focal-length
  ratio `tan(new/2)/tan(old/2)` (zoom-ratio preserving).
- Overwatch/Fortnite constants are approximations — the UI shows cm/360 as primary
  so users can verify with a ruler test (measure physical 360° turn).
