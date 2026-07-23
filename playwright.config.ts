import type { PlaywrightTestProject } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import {
  CHROMIUM_ONLY_SPECS,
  DEV_ONLY_SPECS,
  DEV_ONLY_TAG,
  ECOSYSTEM_CI_IGNORED_SPECS,
  PRD_ONLY_SPECS,
  PRD_ONLY_TAG,
  UBUNTU_LTS_ONLY_SPECS,
} from './e2e/suites.js';
import type { TestOptions } from './e2e/utils.js';

const e2eSuite = process.env.E2E_SUITE;
if (e2eSuite && e2eSuite !== 'full-matrix' && e2eSuite !== 'ubuntu-lts') {
  throw new Error(`Unknown E2E_SUITE: ${e2eSuite}`);
}

const toGlobs = (specs: readonly string[]) => specs.map((spec) => `**/${spec}`);

const ubuntuLtsOnlySpecs = toGlobs(UBUNTU_LTS_ONLY_SPECS);
const chromiumOnlySpecs = toGlobs(CHROMIUM_ONLY_SPECS);
const prdOnlySpecs = toGlobs(PRD_ONLY_SPECS);
const devOnlySpecs = toGlobs(DEV_ONLY_SPECS);
const ecosystemCiIgnoredSpecs = toGlobs(ECOSYSTEM_CI_IGNORED_SPECS);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = defineConfig<TestOptions>({
  testDir: './e2e',
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 10_000 : 5_000,
  },
  use: {
    viewport: { width: 1440, height: 800 },
    locale: 'en-US',
    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    // You can open traces locally(`npx playwright show-trace trace.zip`)
    // or in your browser on [Playwright Trace Viewer](https://trace.playwright.dev/).
    trace: 'on-first-retry',
    // Record video only when retrying a test for the first time.
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // Workaround: WebKit has flaky internal crashes and network process errors on CI
      retries: process.env.CI ? 2 : 0,
    },
  ].flatMap<PlaywrightTestProject<TestOptions>>((item) => [
    {
      ...item,
      name: `${item.name}-dev`,
      ...(e2eSuite === 'ubuntu-lts' && {
        testMatch: ubuntuLtsOnlySpecs,
      }),
      testIgnore: [
        ...(e2eSuite === 'full-matrix' ? ubuntuLtsOnlySpecs : []),
        ...(item.name === 'chromium' ? [] : chromiumOnlySpecs),
        ...prdOnlySpecs,
        ...(process.env.ECOSYSTEM_CI ? ecosystemCiIgnoredSpecs : []),
      ],
      grepInvert: PRD_ONLY_TAG,
      use: {
        ...item.use,
        mode: 'DEV',
      },
    },
    {
      ...item,
      name: `${item.name}-prd`,
      ...(e2eSuite === 'ubuntu-lts' && {
        testMatch: ubuntuLtsOnlySpecs,
      }),
      testIgnore: [
        ...(e2eSuite === 'full-matrix' ? ubuntuLtsOnlySpecs : []),
        ...(item.name === 'chromium' ? [] : chromiumOnlySpecs),
        ...devOnlySpecs,
        ...(process.env.ECOSYSTEM_CI ? ecosystemCiIgnoredSpecs : []),
      ],
      grepInvert: DEV_ONLY_TAG,
      use: {
        ...item.use,
        mode: 'PRD',
      },
    },
  ]),
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 4,
  retries: 0,
  // 'github' for GitHub Actions CI to generate annotations, plus a concise 'dot'
  // default 'list' when running locally
  // See https://playwright.dev/docs/test-reporters#github-actions-annotations
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
});

export default config;
