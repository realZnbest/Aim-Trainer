import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5173);

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    headless: true,
  },
  webServer: {
    command: `pnpm dev --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
};

export default config;
