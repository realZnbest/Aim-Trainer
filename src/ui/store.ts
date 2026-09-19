/**
 * UI state (Zustand). Hot-path game state lives in refs/mutable engine objects —
 * NEVER in this store (no re-render in the game loop; HUD polls at ~10Hz).
 * @module ui/store
 */
import { create } from 'zustand';
import type { Scenario } from '@/scenarios/schema';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import type { SessionRecord } from '@/persistence/db';

export type View = 'menu' | 'game' | 'results' | 'dashboard' | 'settings';

export interface CrosshairSettings {
  color: string;
  gap: number;
  thickness: number;
  length: number;
  dot: boolean;
  outline: boolean;
  alpha: number;
}

export interface SensitivitySettings {
  cm360: number;
  dpi: number;
  game: 'valorant' | 'cs2' | 'apex' | 'overwatch' | 'fortnite';
  gameSens: number;
  multX: number;
  multY: number;
  invertY: boolean;
}

export interface VideoSettings {
  fov: number;
  resolutionScale: number;
  fpsCap: number;
  antialias: boolean;
  bloom: boolean;
  contrast: number;
  brightness: number;
}

export interface LastResult {
  session: Omit<SessionRecord, 'id'>;
  insights: { id: string; title: string; detail: string; severity: string }[];
}

interface AppState {
  view: View;
  scenarioId: string;
  runId: number;
  consent: 'unknown' | 'accepted' | 'declined';
  lastResult: LastResult | null;
  crosshair: CrosshairSettings;
  sens: SensitivitySettings;
  video: VideoSettings;
  hitSound: 'click' | 'tick' | 'thock' | 'beep';
  masterVolume: number;
  hitVolume: number;
  language: 'en' | 'th';
  colorblind: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

  setView: (v: View) => void;
  startScenario: (id: string) => void;
  setResult: (r: LastResult) => void;
  setConsent: (c: AppState['consent']) => void;
  patchCrosshair: (p: Partial<CrosshairSettings>) => void;
  patchSens: (p: Partial<SensitivitySettings>) => void;
  patchVideo: (p: Partial<VideoSettings>) => void;
  setHitSound: (s: AppState['hitSound']) => void;
  setVolumes: (master: number, hit: number) => void;
  setLanguage: (l: 'en' | 'th') => void;
  setColorblind: (c: AppState['colorblind']) => void;
  scenario: () => Scenario;
}

export const useApp = create<AppState>((set, get) => ({
  view: 'menu',
  scenarioId: 'gridshot',
  runId: 0,
  consent: 'unknown',
  lastResult: null,
  crosshair: {
    color: '#22d3ee',
    gap: 4,
    thickness: 2,
    length: 8,
    dot: true,
    outline: true,
    alpha: 1,
  },
  sens: {
    cm360: 30,
    dpi: 800,
    game: 'valorant',
    gameSens: 0.35,
    multX: 1,
    multY: 1,
    invertY: false,
  },
  video: {
    fov: 103,
    resolutionScale: 1,
    fpsCap: 240,
    antialias: true,
    bloom: false,
    contrast: 1.15,
    brightness: 1,
  },
  hitSound: 'click',
  masterVolume: 0.8,
  hitVolume: 0.9,
  language: 'en',
  colorblind: 'none',

  setView: (view) => set({ view }),
  startScenario: (scenarioId) => set((s) => ({ scenarioId, view: 'game', runId: s.runId + 1 })),
  setResult: (lastResult) => set({ lastResult, view: 'results' }),
  setConsent: (consent) => set({ consent }),
  patchCrosshair: (p) => set((s) => ({ crosshair: { ...s.crosshair, ...p } })),
  patchSens: (p) => set((s) => ({ sens: { ...s.sens, ...p } })),
  patchVideo: (p) => set((s) => ({ video: { ...s.video, ...p } })),
  setHitSound: (hitSound) => set({ hitSound }),
  setVolumes: (masterVolume, hitVolume) => set({ masterVolume, hitVolume }),
  setLanguage: (language) => set({ language }),
  setColorblind: (colorblind) => set({ colorblind }),
  scenario: () => {
    const id = get().scenarioId;
    const found = BUILT_IN_SCENARIOS.find((s) => s.id === id);
    if (!found) throw new Error(`Unknown scenario: ${id}`);
    return found;
  },
}));
