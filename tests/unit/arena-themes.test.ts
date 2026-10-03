import { describe, expect, it } from 'vitest';
import {
  ARENA_THEMES,
  MAP_THEMES,
  TARGET_BASE,
  targetBaseColor,
  targetContrastScale,
} from '@/ui/arenaThemes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('arena themes', () => {
  it('every theme token is a valid hex color and fog matches background', () => {
    for (const name of MAP_THEMES) {
      const theme = ARENA_THEMES[name];
      for (const [k, v] of Object.entries(theme)) {
        if (typeof v === 'string') expect(v, `${name}.${k}`).toMatch(HEX);
      }
      expect(theme.ambient).toBeGreaterThan(0);
    }
  });

  it('target palette: default is range-blue, colorblind modes differ', () => {
    expect(targetBaseColor('none')).toBe(TARGET_BASE);
    const cb = new Set([
      targetBaseColor('deuteranopia'),
      targetBaseColor('protanopia'),
      targetBaseColor('tritanopia'),
    ]);
    expect(cb.size).toBe(3);
    expect(cb.has(TARGET_BASE)).toBe(false);
  });

  it('contrast default is neutral and scale is clamped', () => {
    expect(targetContrastScale(1.15)).toBe(1);
    expect(targetContrastScale(0)).toBe(0.5);
    expect(targetContrastScale(99)).toBe(2);
  });
});
