import { test, expect } from '@playwright/test';

/**
 * Render-cost budget per map (draw calls, triangles, GPU objects). Counts are
 * hardware-independent, unlike FPS, so this catches accidental per-prop meshes,
 * runaway geometry or texture leaks. Reads renderer.info through the dev-only
 * `window.__aimGl` hook, so it needs the dev server (the default e2e webServer).
 */
const BUDGET = { callsPerFrame: 150, trisPerFrame: 90_000, textures: 45, geometries: 90 };

for (const map of ['range', 'hangar', 'rooftop', 'void']) {
  test(`render budget: ${map}`, async ({ page }) => {
    await page.addInitScript((m) => {
      localStorage.setItem(
        'aim-trainer-settings',
        JSON.stringify({
          state: {
            consent: 'accepted',
            video: {
              fov: 103,
              resolutionScale: 1,
              fpsCap: 240,
              antialias: true,
              bloom: true,
              reflections: true,
              autoQuality: false,
              mapTheme: m,
              contrast: 1.15,
              brightness: 1,
            },
          },
          version: 4,
        }),
      );
    }, map);
    await page.goto('/');
    await page.getByRole('button', { name: 'start Gridshot' }).click();
    await page.waitForFunction(() => (window as unknown as { __aimGl?: unknown }).__aimGl, null, {
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);
    const stats = await page.evaluate(async () => {
      const gl = (
        window as unknown as {
          __aimGl: {
            info: {
              autoReset: boolean;
              reset: () => void;
              render: { calls: number; triangles: number };
              memory: { textures: number; geometries: number };
            };
          };
        }
      ).__aimGl;
      gl.info.autoReset = false;
      gl.info.reset();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          frames++;
          if (frames >= 6) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return {
        callsPerFrame: gl.info.render.calls / frames,
        trisPerFrame: gl.info.render.triangles / frames,
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
      };
    });
    expect(stats.callsPerFrame).toBeLessThan(BUDGET.callsPerFrame);
    expect(stats.trisPerFrame).toBeLessThan(BUDGET.trisPerFrame);
    expect(stats.textures).toBeLessThan(BUDGET.textures);
    expect(stats.geometries).toBeLessThan(BUDGET.geometries);
  });
}
