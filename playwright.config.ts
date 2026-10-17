import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4173);
/** Server synchronizace pro e2e (nikdy 4173). */
export const SYNC_PORT = Number(process.env.PW_SYNC_PORT ?? 4194);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/prvnacek/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit-ipad', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
  // Testuje se produkční build (npm run build musí proběhnout předem).
  webServer: [
    {
      command: `npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/prvnacek/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'rm -rf .sync-test-data && npm run server:build && node server/dist/index.js',
      url: `http://localhost:${SYNC_PORT}/health`,
      env: { PORT: String(SYNC_PORT), DATA_DIR: '.sync-test-data', HOST: '127.0.0.1' },
      reuseExistingServer: false,
    },
  ],
});
