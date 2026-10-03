/**
 * Arena visual themes + target palette helpers. Pure data: no three.js imports,
 * so it is unit-testable. Gameplay-first: every theme keeps the target lane
 * dark/neutral enough for the range-blue (or colorblind) target to read.
 * @module ui/arenaThemes
 */
export type MapTheme = 'night' | 'neon' | 'concrete';
export type ColorblindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export interface ArenaTheme {
  fog: string;
  floor: string;
  floorSeam: string;
  gridMajor: string;
  gridMinor: string;
  front: string;
  wall: string;
  wallSeam: string;
  ceiling: string;
  beam: string;
  metal: string;
  metalDark: string;
  pillar: string;
  /** Wall-base glow strip. */
  strip: string;
  /** Single accent used for stripes, collars and bands. */
  accent: string;
  /** Pillar edge light. */
  edge: string;
  lamp: string;
  /** Environment-map light colors (reflections on metal/gun). */
  envLight: string;
  envAccent: string;
  hemiSky: string;
  hemiGround: string;
  ambient: number;
}

export const ARENA_THEMES: Record<MapTheme, ArenaTheme> = {
  night: {
    fog: '#0b1426',
    floor: '#0c152b',
    floorSeam: '#1b2c52',
    gridMajor: '#20355f',
    gridMinor: '#141f3a',
    front: '#101c38',
    wall: '#0e1932',
    wallSeam: '#1a2b52',
    ceiling: '#0d1730',
    beam: '#16264a',
    metal: '#1a2c52',
    metalDark: '#0f1c38',
    pillar: '#14234a',
    strip: '#1f4b9e',
    accent: '#ff4655',
    edge: '#4c8dff',
    lamp: '#cfe0ff',
    envLight: '#a9c6ff',
    envAccent: '#ff4655',
    hemiSky: '#3a5a94',
    hemiGround: '#0a0f1e',
    ambient: 1.15,
  },
  neon: {
    fog: '#0d0820',
    floor: '#0b0716',
    floorSeam: '#2a1457',
    gridMajor: '#4a1f9a',
    gridMinor: '#1f1040',
    front: '#130a28',
    wall: '#150b2c',
    wallSeam: '#2a1457',
    ceiling: '#0e0820',
    beam: '#241247',
    metal: '#2a1655',
    metalDark: '#190e30',
    pillar: '#1e1040',
    strip: '#7a2cff',
    accent: '#ff2fa0',
    edge: '#27e0ff',
    lamp: '#f0d9ff',
    envLight: '#c9a3ff',
    envAccent: '#27e0ff',
    hemiSky: '#6a3ab0',
    hemiGround: '#0b0716',
    ambient: 1.2,
  },
  concrete: {
    fog: '#3d4450',
    floor: '#2c3138',
    floorSeam: '#4a515c',
    gridMajor: '#5b6472',
    gridMinor: '#3a414b',
    front: '#363d48',
    wall: '#444b57',
    wallSeam: '#586070',
    ceiling: '#2a2f37',
    beam: '#383e49',
    metal: '#5b6270',
    metalDark: '#454b57',
    pillar: '#505766',
    strip: '#e0a24a',
    accent: '#e0702f',
    edge: '#ffd28a',
    lamp: '#fff4dc',
    envLight: '#fff0d0',
    envAccent: '#e0a24a',
    hemiSky: '#8a96ad',
    hemiGround: '#23272e',
    ambient: 1.25,
  },
};

export const MAP_THEMES = Object.keys(ARENA_THEMES) as MapTheme[];

export const TARGET_BASE = '#3772A4';

/** Okabe–Ito–derived target colors that stay distinct from the dark-blue range. */
const CB_TARGET: Record<Exclude<ColorblindMode, 'none'>, string> = {
  deuteranopia: '#e69f00',
  protanopia: '#f0e442',
  tritanopia: '#ff5c8a',
};

export function targetBaseColor(mode: ColorblindMode): string {
  return mode === 'none' ? TARGET_BASE : CB_TARGET[mode];
}

/**
 * Brightness multiplier for the target color. The settings default (1.15)
 * is the authored look, so it maps to exactly 1.
 */
export function targetContrastScale(contrast: number): number {
  return Math.max(0.5, Math.min(2, contrast / 1.15));
}
