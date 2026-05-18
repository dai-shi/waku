import { expect } from '@playwright/test';
import { FETCH_ERROR_MESSAGES, prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('rsc-basic');

test.describe(`rsc-basic`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');

    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('0');
    await page.getByTestId('client-counter').getByTestId('increment').click();
    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('1');
    await page.getByTestId('client-counter').getByTestId('increment').click();
    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('2');
  });

  test('index.html', async ({ request }) => {
    const res = await request.get(`http://localhost:${port}/`);
    expect(await res.text()).toContain('name="test-custom-index-html"');
  });

  test('server ping', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');

    await expect(
      page.getByTestId('server-ping').getByTestId('pong'),
    ).toBeEmpty();
    await page.getByTestId('server-ping').getByTestId('ping').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('pong'),
    ).toHaveText('pong');

    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('0');
    await page.getByTestId('server-ping').getByTestId('increase').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('1');
    await page.getByTestId('server-ping').getByTestId('increase').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('2');

    await expect(
      page.getByTestId('server-ping').getByTestId('wrapped'),
    ).toBeEmpty();
    await page.getByTestId('server-ping').getByTestId('wrap').click();
    await expect(
      page
        .getByTestId('server-ping')
        .getByTestId('wrapped')
        .locator('.via-server'),
    ).toHaveText('okay');

    // https://github.com/wakujs/waku/issues/1420
    await page
      .getByTestId('server-ping')
      .getByTestId('show-server-data')
      .click();
    await expect(
      page.getByTestId('server-ping').locator('.server-data'),
    ).toHaveText('Server Data');
    expect(
      messages.some((m) =>
        /Cannot update a component \S+ while rendering a different component/.test(
          m,
        ),
      ),
    ).toBe(false);
  });

  test('refetch', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await page.getByTestId('refetch1').click();
    await expect(page.getByTestId('app-name')).toHaveText('foo');
    await page.getByTestId('refetch2').click();
    await expect(page.getByTestId('app-name')).toHaveText('[bar]');
    await page.getByTestId('refetch3').click();
    await expect(page.getByTestId('app-name')).toHaveText('baz/qux');
    await page.getByTestId('refetch4').click();
    await expect(page.getByTestId('app-name')).toHaveText('params');
    await expect(page.getByTestId('refetch-params')).toHaveText(
      '{"foo":"bar"}',
    );
  });

  test('refetch with transition', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/`);
    await page.getByTestId('refetch1').click();
    await expect(page.getByTestId('app-name')).toHaveText('foo');
    await page.getByTestId('refetch5').click();
    await expect(page.getByTestId('refetch-transition')).toHaveText('pending');
    await expect(page.getByTestId('app-name')).toHaveText('with-transition');
    await expect(page.getByTestId('refetch-transition')).toHaveText('idle');
  });

  test('server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await expect(page.getByTestId('ai-internal-provider')).toHaveText(
      'globalThis.actions: ["foo"]',
    );
    const result = await page.evaluate(() => {
      // @ts-expect-error no types
      return globalThis.actions.foo();
    });
    expect(result).toBe(0);
  });

  test('server throws', async ({ page }) => {
    serverOutput.splice(0);
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await page.getByTestId('server-throws').getByTestId('throws').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText('Internal Server Error');
    await expect
      .poll(() => serverOutput.join(''))
      .toContain('Input is required');
  });

  test('server handle network errors', async ({ page, mode, browserName }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await page.getByTestId('server-throws').getByTestId('success').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('It worked');
    await page.getByTestId('server-throws').getByTestId('reset').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('init');
    await stopApp();
    await page.getByTestId('server-throws').getByTestId('success').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText(FETCH_ERROR_MESSAGES[browserName]);
    ({ port, stopApp } = await startApp(mode));
  });

  test('allowServer', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await expect(page.getByTestId('some-config-foo')).toHaveText('value-1234');
  });

  test('build metadata', async ({ page, mode }) => {
    test.skip(mode !== 'PRD', 'Build metadata is only available in build mode');
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('build-metadata')).toHaveText(
      'metadata-value',
    );
  });
});
