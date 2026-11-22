import { defineConfig, devices } from '@playwright/test';

// Explicit prototype gate: run separately from the regular regression suites.
export default defineConfig({
  testDir: '.',
  testMatch: 'streaming-playback.spec.ts',
  workers: 1,
  outputDir: '../../temp/ux/streaming-playback/results',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4201', trace: 'retain-on-failure' },
  webServer: {
    command: 'node helpers/streaming-origin-proxy.cjs',
    url: 'http://localhost:4201',
    reuseExistingServer: false
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
