import { defineConfig, devices } from '@playwright/test';

/**
 * Behaviour, not screenshots.
 *
 * Every failure this suite exists for was found by hand in a browser and by nothing else: a fold
 * that swallowed a group, a panel that cleared the list an author was choosing from, rows reading
 * "BERO BERO", a row three times the height of its neighbours. None of them are visible to a unit
 * test, and none of them need a screenshot to assert — they need a real browser, real layout, and
 * the built bundle.
 *
 * The terminology server is not one of the things under test. Every response is a fixture, so the
 * suite is hermetic and says what the component does with an answer rather than whether the server
 * gave a good one.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4599',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://localhost:4599',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
