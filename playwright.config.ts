import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

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
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/prvnacek/`,
    reuseExistingServer: !process.env.CI,
  },
});
