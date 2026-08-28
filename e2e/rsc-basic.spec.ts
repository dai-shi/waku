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

  test(
    'deprecated additive HMR listeners can register before Root mounts',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');

      const called = await page.evaluate(() => {
        globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((listener) =>
          listener(),
        );
        return (
          globalThis as typeof globalThis & {
            __WAKU_ROOTLESS_HMR_LISTENER__?: boolean;
          }
        ).__WAKU_ROOTLESS_HMR_LISTENER__;
      });

      expect(called).toBe(true);
    },
  );

  test(
    'deprecated replacement HMR listeners can register before Root mounts',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');

      const registered = await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __WAKU_ROOTLESS_HMR_REPLACEMENT_REGISTERED__?: boolean;
            }
          ).__WAKU_ROOTLESS_HMR_REPLACEMENT_REGISTERED__,
      );

      expect(registered).toBe(true);
    },
  );

  test('server actions target the default minimal root', async ({ page }) => {
    await page.goto(`http://localhost:${port}/?multiple-roots`);
    await expect(page.getByTestId('first-root')).toContainText('first');
    await expect(page.getByTestId('second-root')).toContainText('second');
    await page
      .getByTestId('first-root')
      .getByRole('button', { name: 'Update content' })
      .click();
    await expect(page.getByTestId('second-root')).toContainText(
      'updated content',
    );
    await page.getByTestId('unmount-second-root').click();
    await page
      .getByTestId('first-root')
      .getByRole('button', { name: 'Update content' })
      .click();
    await expect(page.getByTestId('first-root')).toContainText(
      'updated content',
    );
  });

  test('simultaneously suspended Roots settle independently', async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:${port}/?multiple-roots&simultaneous-roots`,
    );
    await expect(page.getByTestId('first-root')).toContainText('first');
    await expect(page.getByTestId('second-root')).toContainText('second');
  });

  test(
    'unmounting the default Root restores the previous HMR target',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/?multiple-roots`);
      await expect(page.getByTestId('first-root')).toContainText('first');
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page.getByTestId('unmount-second-root').click();

      const requests = await page.evaluate(async () => {
        const urls: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => {
          urls.push(String(args[0]));
          return originalFetch(...args);
        };
        try {
          globalThis.__WAKU_REFETCH_RSC__?.();
          await Promise.resolve();
        } finally {
          globalThis.fetch = originalFetch;
        }
        return urls;
      });

      expect(requests).toContain('/RSC/first.txt');
    },
  );

  test('HMR reloads every mounted Root', { tag: '@dev' }, async ({ page }) => {
    await page.goto(`http://localhost:${port}/?multiple-roots`);
    await expect(page.getByTestId('first-root')).toContainText('first');
    await expect(page.getByTestId('second-root')).toContainText('second');

    const requests = await page.evaluate(() => {
      const urls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (...args) => {
        urls.push(String(args[0]));
        return originalFetch(...args);
      };
      try {
        globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((listener) =>
          listener(),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
      return urls;
    });

    expect(requests).toContain('/RSC/first.txt');
    expect(requests).toContain('/RSC/second.txt');
  });

  test(
    'HMR clears cached etags from every Root',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/?multiple-roots`);
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page.evaluate(() => globalThis.__WAKU_REFETCH_RSC__?.());
      await page.getByTestId('unmount-second-root').click();

      const actionRequest = page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          new URL(request.url()).pathname.startsWith('/RSC/'),
      );
      await page
        .getByTestId('first-root')
        .getByRole('button', { name: 'Update content' })
        .click();

      expect((await actionRequest).headers()['x-waku-etags']).toBe('{}');
    },
  );

  test(
    "unmounting the default Root restores the previous Root's descendant HMR target",
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(
        `http://localhost:${port}/?multiple-roots&descendant-hmr=first`,
      );
      await expect(page.getByTestId('first-root')).toContainText('first');
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page.getByTestId('unmount-second-root').click();

      const called = await page.evaluate(() => {
        globalThis.__WAKU_REFETCH_RSC__?.();
        return (
          globalThis as typeof globalThis & {
            __WAKU_TEST_HMR_TARGET__?: string;
          }
        ).__WAKU_TEST_HMR_TARGET__;
      });

      expect(called).toBe('first');
    },
  );

  test(
    'a non-default Root can own its HMR target',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/?multiple-roots`);
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page
        .getByTestId('first-root')
        .getByRole('button', { name: 'Own HMR', exact: true })
        .click();
      await expect(
        page
          .getByTestId('first-root')
          .getByRole('button', { name: 'Owns HMR' }),
      ).toBeVisible();
      await page.getByTestId('unmount-second-root').click();

      const called = await page.evaluate(() => {
        globalThis.__WAKU_REFETCH_RSC__?.();
        return (
          globalThis as typeof globalThis & {
            __WAKU_TEST_HMR_TARGET__?: string;
          }
        ).__WAKU_TEST_HMR_TARGET__;
      });

      expect(called).toBe('first');
    },
  );

  test(
    "unmounting a Root with a descendant HMR target restores the previous Root's target",
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(
        `http://localhost:${port}/?multiple-roots&descendant-hmr=second`,
      );
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page.getByTestId('unmount-second-root').click();

      const requests = await page.evaluate(async () => {
        const urls: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => {
          urls.push(String(args[0]));
          return originalFetch(...args);
        };
        try {
          globalThis.__WAKU_REFETCH_RSC__?.();
          await Promise.resolve();
        } finally {
          globalThis.fetch = originalFetch;
        }
        return urls;
      });

      expect(requests).toContain('/RSC/first.txt');
    },
  );

  test(
    'unmounting a middle Root preserves earlier HMR ownership',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(
        `http://localhost:${port}/?multiple-roots&three-roots&descendant-hmr=first`,
      );
      await expect(page.getByTestId('third-root')).toContainText('third');
      await page.getByTestId('unmount-second-root').click();
      await page.getByTestId('unmount-third-root').click();

      const called = await page.evaluate(() => {
        globalThis.__WAKU_REFETCH_RSC__?.();
        return (
          globalThis as typeof globalThis & {
            __WAKU_TEST_HMR_TARGET__?: string;
          }
        ).__WAKU_TEST_HMR_TARGET__;
      });

      expect(called).toBe('first');
    },
  );

  test(
    'rerendering a Root preserves its descendant HMR target',
    { tag: '@dev' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/?multiple-roots`);
      await expect(page.getByTestId('second-root')).toContainText('second');
      await page.evaluate(() => {
        const previous = globalThis.__WAKU_REFETCH_RSC__;
        const listeners = globalThis.__WAKU_RSC_RELOAD_LISTENERS__;
        const replacement = () => {
          (
            globalThis as typeof globalThis & {
              __WAKU_TEST_HMR_TARGET__?: boolean;
            }
          ).__WAKU_TEST_HMR_TARGET__ = true;
        };
        const index = previous && listeners?.indexOf(previous);
        if (listeners && typeof index === 'number' && index !== -1) {
          listeners.splice(index, 1, replacement);
        }
        globalThis.__WAKU_REFETCH_RSC__ = replacement;
      });

      await page.getByTestId('rerender-second-root').click();
      const called = await page.evaluate(() => {
        globalThis.__WAKU_REFETCH_RSC__?.();
        return (
          globalThis as typeof globalThis & {
            __WAKU_TEST_HMR_TARGET__?: boolean;
          }
        ).__WAKU_TEST_HMR_TARGET__;
      });

      expect(called).toBe(true);
    },
  );

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

  test('build metadata', { tag: '@prd' }, async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('build-metadata')).toHaveText(
      'metadata-value',
    );
  });
});
