import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('hot-reload');

const originalFiles: { [key: string]: string | false } = {};

function modifyFile(
  standaloneDir: string,
  file: string,
  search: string,
  replace: string,
) {
  const filePath = join(standaloneDir, file);
  const content = readFileSync(filePath, 'utf-8');
  originalFiles[filePath] ??= content;
  writeFileSync(filePath, content.replace(search, replace));
}

function createFile(standaloneDir: string, file: string, content: string) {
  const filePath = join(standaloneDir, file);
  if (existsSync(filePath)) {
    originalFiles[filePath] ??= readFileSync(filePath, 'utf-8');
  } else {
    originalFiles[filePath] ??= false;
  }
  writeFileSync(filePath, content);
}

async function expectBackgroundColor(
  page: Page,
  selector: string,
  backgroundColor: string,
) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ selector }) =>
            document.querySelector(selector)
              ? window
                  .getComputedStyle(document.querySelector(selector)!)
                  .getPropertyValue('background-color')
              : null,
          { selector },
        ),
      { timeout: 10_000 },
    )
    .toBe(backgroundColor);
}

async function expectNoFullReloadFor(page: Page) {
  // Give Vite time to surface a delayed full reload after the hot update.
  let mainFrameNavigated = false;
  const onFrameNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigated = true;
    }
  };

  page.on('framenavigated', onFrameNavigated);
  try {
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(500);
  } finally {
    page.off('framenavigated', onFrameNavigated);
  }

  expect(mainFrameNavigated).toBe(false);
}

test.afterAll(() => {
  for (const [file, content] of Object.entries(originalFiles)) {
    if (content === false) {
      unlinkSync(file);
    } else {
      writeFileSync(file, content);
    }
  }
});

test.describe('hot reload', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let standaloneDir: string;

  test.beforeAll(async () => {
    ({ port, stopApp, fixtureDir: standaloneDir } = await startApp('DEV'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('server and client', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByText('Home Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    // Server component hot reload
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Home Page',
      'Modified Page',
    );
    await expectNoFullReloadFor(page);
    await expect(page.getByText('Modified Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Client component HMR
    modifyFile(
      standaloneDir,
      'src/components/counter.tsx',
      'Increment',
      'Plus One',
    );
    await expectNoFullReloadFor(page);
    await expect(page.getByTestId('increment')).toHaveText('Plus One');
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('3');
    // Server component hot reload again
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Modified Page',
      'Edited Page',
    );
    await expectNoFullReloadFor(page);
    await expect(page.getByText('Edited Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('3');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('4');
    // Jump to another page and back
    await page.getByTestId('about').click();
    await expect(page.getByText('About Page')).toBeVisible();
    modifyFile(
      standaloneDir,
      'src/pages/about.tsx',
      'About Page',
      'About2 Page',
    );
    await expectNoFullReloadFor(page);
    await expect(page.getByText('About2 Page')).toBeVisible();
    await page.getByTestId('home').click();
    await expect(page.getByText('Edited Page')).toBeVisible();
    // Modify with a JSX syntax error
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<p>Edited Page</p>',
      '<pEdited Page</p>',
    );
    await expectNoFullReloadFor(page);
    await expect(page.locator('vite-error-overlay')).toBeAttached();
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<pEdited Page</p>',
      '<p>Fixed Page</p>',
    );
    await expectNoFullReloadFor(page);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.getByText('Fixed Page')).toBeVisible();
  });

  test('css modules', async ({ page }) => {
    await page.goto(`http://localhost:${port}/css-modules`);
    await waitForHydration(page);
    await expect(page.getByTestId('css-modules-header')).toHaveText(
      'CSS Modules',
    );
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    await expectBackgroundColor(
      page,
      '[data-testid="css-modules-header"]',
      'rgb(0, 128, 0)',
    );
    modifyFile(
      standaloneDir,
      'src/pages/css-modules.module.css',
      'background-color: green;',
      'background-color: yellow;',
    );
    await expectNoFullReloadFor(page);
    await expectBackgroundColor(
      page,
      '[data-testid="css-modules-header"]',
      'rgb(255, 255, 0)',
    );
    await expect(page.getByTestId('count')).toHaveText('1');
  });

  test('css modules in client components with a reload (#1328)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/css-modules-client`);
    await waitForHydration(page);
    await expect(page.getByTestId('css-modules-client')).toHaveText('Hello');
    await expectBackgroundColor(
      page,
      '[data-testid="css-modules-client"]',
      'rgb(255, 0, 0)',
    );

    modifyFile(
      standaloneDir,
      'src/pages/css-modules-client.module.css',
      'background-color: red;',
      'background-color: blue;',
    );
    await expectNoFullReloadFor(page);
    await expectBackgroundColor(
      page,
      '[data-testid="css-modules-client"]',
      'rgb(0, 0, 255)',
    );

    await page.reload();
    await expectBackgroundColor(
      page,
      '[data-testid="css-modules-client"]',
      'rgb(0, 0, 255)',
    );
  });

  test('indirect client components (#1491)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1000');
    // Client component HMR
    modifyFile(
      standaloneDir,
      'src/components/message.tsx',
      'Mesg 1000',
      'Mesg 1001',
    );
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1001');
    await expectNoFullReloadFor(page);
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Browser refresh
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1001');
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    expect(errors.join('\n')).not.toContain('hydration-mismatch');
  });

  test('restart server when waku config changed', async ({ request }) => {
    const res = await request.get(`http://localhost:${port}/__test_edit`);
    expect(await res.text()).not.toEqual('ok');
    // add middleware to verify the config is reloaded
    modifyFile(
      standaloneDir,
      'waku.config.ts',
      'defineConfig({})',
      `\
defineConfig({
  vite: {
    plugins: [
      [
        {
          name: 'test',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === "/__test_edit") {
                res.end("ok");
                return;
              }
              next();
            });
          }
        }
      ]
    ]
  }
})
`,
    );
    // wait for restart
    await expect(async () => {
      const res = await request.get(`http://localhost:${port}/__test_edit`);
      expect(await res.text()).toEqual('ok');
    }).toPass({ timeout: 10_000 });
  });

  test('reload environment variables when new env added', async ({
    request,
  }) => {
    // Create initial .env file with only one variable
    createFile(standaloneDir, '.env', 'TEST_MESSAGE=Hello from initial .env\n');

    // Add middleware to expose env vars
    // Use createFile instead of modifyFile because a previous test may have
    // already replaced the original defineConfig({}) content.
    createFile(
      standaloneDir,
      'waku.config.ts',
      `import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      [
        {
          name: 'test-env',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === "/__test_env") {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  testMessage: process.env.TEST_MESSAGE,
                  appVersion: process.env.APP_VERSION,
                  newFeature: process.env.NEW_FEATURE,
                }));
                return;
              }
              next();
            });
          }
        }
      ]
    ]
  }
});
`,
    );

    // Wait for server restart after config change
    await expect(async () => {
      const res = await request.get(`http://localhost:${port}/__test_env`);
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.testMessage).toEqual('Hello from initial .env');
      expect(data.appVersion).toBeUndefined();
      expect(data.newFeature).toBeUndefined();
    }).toPass({ timeout: 20_000 });

    // Add a new env variable
    createFile(
      standaloneDir,
      '.env',
      'TEST_MESSAGE=Hello from initial .env\nAPP_VERSION=1.0.0\n',
    );

    // Wait for server restart and verify new env var is available
    await expect(async () => {
      const res = await request.get(`http://localhost:${port}/__test_env`);
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.testMessage).toEqual('Hello from initial .env');
      expect(data.appVersion).toEqual('1.0.0');
      expect(data.newFeature).toBeUndefined();
    }).toPass({ timeout: 20_000 });

    // Add another new env variable
    createFile(
      standaloneDir,
      '.env',
      'TEST_MESSAGE=Hello from initial .env\nAPP_VERSION=1.0.0\nNEW_FEATURE=enabled\n',
    );

    // Verify the newly added env var is available
    await expect(async () => {
      const res = await request.get(`http://localhost:${port}/__test_env`);
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.testMessage).toEqual('Hello from initial .env');
      expect(data.appVersion).toEqual('1.0.0');
      expect(data.newFeature).toEqual('enabled');
    }).toPass({ timeout: 20_000 });
  });
});
