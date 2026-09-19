# DESIGN.md — Night-range world (built truth)

## World

A marksman's logbook, not an arcade. The athlete trains on a dark blue-black
range at night; the interface is the range board: hairline measurement, one
pink action color, steel-blue information. Matte surfaces, no glow, no
gradient text, no glass. Dark is forced by the scene (dim training room),
never by category.

## Palette (tokens in `tailwind.config.js`)

- Grounds: `abyss #04070e` · `deep #070c17` · `panel #0a1120` · `raised #0e1628`
- Hairlines (blue-tinted steel, never gray): `line #22304e` · `linesoft #141e36`
- Ink (tinted from the ground): `ink #e9effc` · `mist #93a3c4` · `faint #5d6d92`
- Brand pink (single action color): `#e7548f` · hover `#f06ba1` · on-dark
  large text `#f4a3c3` · dark text on pink `#1c0712`
- Steel blue (info, range markings): `#6ea8ff` · deep `#3b5fa0`
- Semantics: `danger #e56a80` · `success #5fce8f` · `warn #e0b25f`
- Tiers ramp slate → pink: Bronze `#c08b5c` · Silver `#9fb0cc` · Gold `#e3b95c` ·
  Platinum `#a9c6ff` · Diamond `#7fb2ff` · Master `#f06ba1` · Grandmaster `#ff8fbf`

## Type

- Display: Chakra Petch 500/600/700 (Latin + Thai, Google Fonts, display=swap).
  Uppercase ledger headings, tracking −0.02em, never below −0.04em.
- Body: system stack. Data/measurement: system mono + `tnum` (tabular nums).
- No kickers/eyebrows; headings carry their own weight.

## Components (`ui/components/primitives.tsx` + `.field` in `index.css`)

- `ReticleMark` — brand mark, drawn geometry; cyan `#22d3ee` (matches favicon).
- `Button` — primary pink solid/dark text; steel tint; ghost hairline; danger tint.
- `Card` — 14px radius, `linesoft` border on `panel`. Never nested.
- `Chip` — small pills for tags only. `Meter` — segmented difficulty ticks.
- `.field` — one dark-steel treatment for all inputs/selects; pink focus border.
- `Check` — authored switch (pink on, steel off), `role="switch"`.
- Drill grid (menu): square 90° cards in a tidy 3-col grid — index numeral,
  focus chip, title, 2-line brief, spec strip, difficulty meter + start.
  Hover: pink hairline border. Dashboard keeps a compact session ledger.
- Results debrief: pink display score, tier chip, hairline ledger rows,
  numbered findings with severity dots. One authored motion: `rise` reveal
  (staggered, reduced-motion safe).

## Rules carried from craft floor

- Radii: cards 14px, controls 8px, tags full-round. Elevation: border, never
  shadow+border ghosts. Severity shown with dots + labels, never thick colored
  edge bars. Icons drawn (reticle, meter ticks), never emoji/unicode symbols.
- Contrast: body ink on abyss ≈ 15:1; mist ≈ 5.5:1; pink button w/ dark text ≈ 7:1.
- Game HUD/arena follow the same tokens. Targets are fixed range-blue
  `#3772A4`, decoupled from the crosshair so the sight always reads against
  the target. Default sight: white with center dot, dark outline. No firing
  hitmarker — feedback is the target bursting + hit sound only.
