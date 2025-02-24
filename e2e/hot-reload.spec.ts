import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';

import {
  isPortAvailable,
  terminate,
  test,
  prepareStandaloneSetup,
} from './utils.js';

const startApp = prepareStandaloneSetup('hot-reload');

async function startAppDev() {
  const HMR_PORT = 24678;
  if (!(await isPortAvailable(HMR_PORT))) {
    if (process.platform === 'win32') {
      const output = execSync(
        `for /f "tokens=5" %A in ('netstat -ano ^| findstr :${HMR_PORT} ^| findstr LISTENING') do @echo %A`,
        {
          encoding: 'utf8',
        },
      );
      if (output) {
        await terminate(parseInt(output));
      }
    } else {
      const output = execSync(`lsof -i:${HMR_PORT} | awk 'NR==2 {print $2}'`, {
        encoding: 'utf8',
      });
      if (output) {
        await terminate(parseInt(output));
      }
    }
  }
  return startApp('DEV');
}

async function modifyFile(
  standaloneDir: string,
  file: string,
  search: string,
  replace: string,
) {
  const content = await readFile(join(standaloneDir, file), 'utf-8');
  await writeFile(join(standaloneDir, file), content.replace(search, replace));
}

test.describe('hot reload', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let standaloneDir: string;
  test.beforeAll(async () => {
    ({ port, stopApp, standaloneDir } = await startAppDev());
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('server and client', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('Home Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    // Server component hot reload
    await modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Home Page',
      'Modified Page',
    );
    await expect(page.getByText('Modified Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Client component HMR
    await modifyFile(
      standaloneDir,
      'src/components/counter.tsx',
      'Increment',
      'Plus One',
    );
    await expect(page.getByText('Plus One')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('3');
    // Server component hot reload again
    await modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Modified Page',
      'Edited Page',
    );
    await expect(page.getByText('Edited Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('3');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('4');
    // Jump to another page and back
    await page.getByTestId('about').click();
    await expect(page.getByText('About Page')).toBeVisible();
    await modifyFile(
      standaloneDir,
      'src/pages/about.tsx',
      'About Page',
      'About2 Page',
    );
    await expect(page.getByText('About2 Page')).toBeVisible();
    await page.getByTestId('home').click();
    await expect(page.getByText('Edited Page')).toBeVisible();
    // Modify with a JSX syntax error
    await modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<p>Edited Page</p>',
      '<pEdited Page</p>',
    );
    await page.waitForTimeout(500); // need to wait for possible crash
    await modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<pEdited Page</p>',
      '<p>Fixed Page</p>',
    );
    await expect(page.getByText('Fixed Page')).toBeVisible();
  });

  test('css modules', async ({ page }) => {
    await page.goto(`http://localhost:${port}/css-modules`);
    await expect(page.getByTestId('css-modules-header')).toHaveText(
      'CSS Modules',
    );
    const bgColor1 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-header"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor1).toBe('rgb(0, 128, 0)');
    await modifyFile(
      standaloneDir,
      'src/pages/css-modules.module.css',
      'background-color: green;',
      'background-color: yellow;',
    );
    await page.waitForTimeout(500); // need to wait for full reload
    const bgColor2 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-header"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor2).toBe('rgb(255, 255, 0)');
  });
});
