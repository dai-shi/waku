import { expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('ssr-target-bundle');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssr-target-bundle: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    let fixtureDir: string;
    test.beforeAll(async () => {
      ({ port, stopApp, fixtureDir } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('image exists in folder public/assets', async () => {
      test.skip(mode === 'DEV');
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('image-not-inlined-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json public linked exists in folder public/assets', async () => {
      test.skip(mode === 'DEV');
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-public-linked-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json private NOT exists in folder public/assets', async () => {
      test.skip(mode === 'DEV');
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-private-'),
      );
      expect(imageExists).not.toBe(true);
    });

    test('add text input', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
      const height = await page
        .getByTestId('textarea')
        .evaluate((el) => el.clientHeight);
      await page.getByTestId('textarea').fill('Line1\nLine2\nLine3');
      const heightChanged = await page
        .getByTestId('textarea')
        .evaluate((el) => el.clientHeight);
      expect(heightChanged).toBeGreaterThan(height);
    });

    test('image was loaded and JSON results exists', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      page.on('response', (data) => {
        console.log(
          data.status(),
          data.url(),
          data.url() /*.includes('image.png')*/,
        );
      });
      await expect(page.getByTestId('image')).toHaveJSProperty(
        'complete',
        true,
      );
      await expect(page.getByTestId('image')).not.toHaveJSProperty(
        'naturalWidth',
        0,
      );
      await expect(page.getByTestId('json-private')).toHaveText('6');
      const value = await page
        .getByTestId('json-public-linked')
        .getAttribute('href');
      expect(value).toMatch(/json-public-linked/);
    });

    test('no js environment should have first screen', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
      await page.close();
      await context.close();
    });
  });
}
