/**
 * Arena visual themes + target palette helpers. Pure data: no three.js imports,
 * so it is unit-testable. Gameplay-first: every theme keeps the target lane
 * dark/neutral enough for the range-blue (or colorblind) target to read.
 * @module ui/arenaThemes
 */
export type MapTheme = 'range' | 'hangar' | 'rooftop' | 'void';
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
  /** Sky dome (rooftop / void). */
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sun: string;
  glow: string;
}

export const ARENA_THEMES: Record<MapTheme, ArenaTheme> = {
  range: {
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
    skyTop: '#0b1426',
    skyMid: '#0b1426',
    skyHorizon: '#0b1426',
    sun: '#ffffff',
    glow: '#4c8dff',
  },
  hangar: {
    fog: '#171a21',
    floor: '#13161c',
    floorSeam: '#2b3038',
    gridMajor: '#2f3540',
    gridMinor: '#1c2028',
    front: '#191d24',
    wall: '#232932',
    wallSeam: '#323945',
    ceiling: '#14171c',
    beam: '#2a303a',
    metal: '#3a4350',
    metalDark: '#262c35',
    pillar: '#2c333d',
    strip: '#ff8a00',
    accent: '#ffb020',
    edge: '#ffd28a',
    lamp: '#ffe2b0',
    envLight: '#ffe6c0',
    envAccent: '#ffb020',
    hemiSky: '#8795ad',
    hemiGround: '#14171c',
    ambient: 1.3,
    skyTop: '#14171c',
    skyMid: '#14171c',
    skyHorizon: '#14171c',
    sun: '#ffe2b0',
    glow: '#ffb020',
  },
  rooftop: {
    fog: '#5b3b66',
    floor: '#2a2c36',
    floorSeam: '#40434f',
    gridMajor: '#454856',
    gridMinor: '#33353f',
    front: '#2a2c36',
    wall: '#3b3e4b',
    wallSeam: '#505361',
    ceiling: '#2a2c36',
    beam: '#3b3e4b',
    metal: '#5a5e6c',
    metalDark: '#3b3e4b',
    pillar: '#4a4d5b',
    strip: '#ffb66b',
    accent: '#ff5a5f',
    edge: '#ffd29a',
    lamp: '#ffd9a0',
    envLight: '#ffb38a',
    envAccent: '#7a8cff',
    hemiSky: '#9a7fb8',
    hemiGround: '#23252e',
    ambient: 0.95,
    skyTop: '#0b1033',
    skyMid: '#4a2b6b',
    skyHorizon: '#ff8a4c',
    sun: '#ffd29a',
    glow: '#ffb66b',
  },
  void: {
    fog: '#12062a',
    floor: '#07030f',
    floorSeam: '#1a0b3a',
    gridMajor: '#27e0ff',
    gridMinor: '#7a2cff',
    front: '#12062a',
    wall: '#12062a',
    wallSeam: '#1a0b3a',
    ceiling: '#07030f',
    beam: '#1a0b3a',
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
    hemiGround: '#07030f',
    ambient: 1.1,
    skyTop: '#05010f',
    skyMid: '#1c0a3d',
    skyHorizon: '#ff2fa0',
    sun: '#ff7a3d',
    glow: '#27e0ff',
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
