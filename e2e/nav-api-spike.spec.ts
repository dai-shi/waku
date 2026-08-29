import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { settleNavigateFinished } from './fixtures/nav-api-spike/src/settle-navigate-finished.js';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('nav-api-spike');

const ALLOWED_IMPORT_PREFIXES = [
  'react',
  'waku/minimal/client',
  'waku/router/client-core',
];

const listFixtureSources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFixtureSources(next));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(next);
    }
  }
  return files;
};

test.describe('settleNavigateFinished', () => {
  test('resolves when finished fulfills', async () => {
    await expect(
      settleNavigateFinished(Promise.resolve()),
    ).resolves.toBeUndefined();
  });

  test('resolves when finished is missing', async () => {
    await expect(settleNavigateFinished(undefined)).resolves.toBeUndefined();
  });

  test('resolves when finished rejects with AbortError', async () => {
    await expect(
      settleNavigateFinished(
        Promise.reject(new DOMException('Aborted', 'AbortError')),
      ),
    ).resolves.toBeUndefined();
  });

  test('rejects when finished rejects with a failure', async () => {
    const error = new Error('failed');
    await expect(settleNavigateFinished(Promise.reject(error))).rejects.toBe(
      error,
    );
  });
});

test.describe('nav-api-spike imports', () => {
  test('binding imports stay on the L1 surface', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).not.toMatch(
      /client\.tsx|router-state|client-utils|client-core-utils/,
    );
    const specs = [...src.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1]!,
    );
    expect(specs.length).toBeGreaterThan(0);
    const packageSpecs = specs.filter(
      (spec) => !spec.startsWith('./') && !spec.startsWith('../'),
    );
    expect(packageSpecs.length).toBeGreaterThan(0);
    for (const spec of packageSpecs) {
      expect(
        ALLOWED_IMPORT_PREFIXES.some((prefix) => spec.includes(prefix)),
        spec,
      ).toBe(true);
    }
  });

  test('navigate maps Navigation API finished onto the host contract', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).toContain('settleNavigateFinished(result.finished)');
  });

  test('navigate intercept honors scroll: false', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).toContain('info: { scroll: opts.scroll }');
    expect(src).toContain("info?.scroll === false ? { scroll: 'manual' } : {}");
  });

  test('FollowBoundary remounts on path and resets on query', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).toContain('key={route.path}');
    expect(src).toContain(
      'routeKey={`${route.path}\\0${route.query}\\0${route.hash}`}',
    );
    expect(src).toContain('getDerivedStateFromProps');
    expect(src).toContain('decideFollow');
  });

  test('slot follow count is not module state', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).not.toMatch(/\bslotFollows\b/);
    expect(src).not.toMatch(/^let lastFollowHref/m);
    expect(src).not.toMatch(/^const lastFollowHref/m);
    expect(src).toContain('state: { follows: nextFollows }');
    expect(src).toContain("typeof info?.follows === 'number'");
    expect(src).not.toContain("event.navigationType !== 'replace'");
    const chainIdx = src.indexOf("typeof info?.follows === 'number'");
    const samePathIdx = src.indexOf(
      'next.path === current.path && next.query === current.query',
    );
    expect(chainIdx).toBeGreaterThan(-1);
    expect(chainIdx).toBeLessThan(samePathIdx);
    expect(src).toContain('last.href === href && last.follows === follows');
    expect(src).toContain('setFollows(outcome.follows)');
    expect(src).toContain('data-testid="owning-follow-count"');
    expect(src).not.toContain(
      "ownsNavigation ? 'owning-follow-count' : 'follow-count'",
    );
  });

  test('mix-b RSC is HTTP 404 so load can 404-follow', () => {
    const src = readFileSync(
      fileURLToPath(
        new URL(
          './fixtures/nav-api-spike/src/middleware/http-404-mix-b.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    expect(src).toContain('/RSC/R/mix-b.txt');
  });

  test('fixture sources import nothing from waku/router/client', () => {
    const root = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/', import.meta.url),
    );
    const files = listFixtureSources(root);
    expect(files.length).toBeGreaterThan(0);
    // client-core is allowed; this matches the history-binding entry only
    const leak = /from ['"]waku\/router\/client['"]/;
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file.slice(root.length)).not.toMatch(
        leak,
      );
    }
  });
});

test.describe('nav-api-spike', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('initial render', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home')).toHaveText('Home');
  });

  test('anchor navigation goes through the navigate event', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello spike');
    await expect(page).toHaveURL(/\/hello\/spike$/);
  });

  test('a missing route follows the 404 page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-missing').click();
    await expect(page.getByTestId('not-found')).toHaveText('Custom 404');
  });

  test('useParams and useSearch work under the spike binding', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/hello/spike`);
    await waitForHydration(page);
    await expect(page.getByTestId('params')).toHaveText('spike');
    await page.getByTestId('go-search').click();
    await expect(page.getByTestId('search')).toHaveText('hi');
  });

  test('a lazy Slice renders', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-slice').click();
    await expect(page.getByTestId('slice-clock')).toHaveText('lazy clock');
  });

  test('returning to a static route keeps URL and content in sync', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-static').click();
    await expect(page.getByTestId('static')).toHaveText('Static');
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello spike');
    await page.getByTestId('go-static').click();
    await expect(page).toHaveURL(/\/static$/);
    await expect(page.getByTestId('static')).toHaveText('Static');
  });

  test('setSearch keeps the hash after a hash-only navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.getByTestId('hash-a').click();
    await expect(page).toHaveURL(/\/search\?q=hi#a$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#a');
    await page.getByTestId('hash-b').click();
    await expect(page).toHaveURL(/\/search\?q=hi#b$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#b');
    await page.getByTestId('set-search').click();
    await expect(page).toHaveURL(/\/search\?q=x#b$/);
    await expect(page.getByTestId('search')).toHaveText('x');
  });

  test('an internal redirect updates the address bar', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-old').click();
    await expect(page.getByTestId('redirect-new')).toHaveText('New');
    await expect(page).toHaveURL(/\/new$/);
  });

  test('a same-path query redirect renders the target', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-canonical').click();
    await expect(page.getByTestId('canonical')).toHaveText('Canonical new');
    await expect(page).toHaveURL(/\/canonical\?v=new$/);
  });

  test('a hash-only slot redirect surfaces a follow error', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hash-only').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'detected a navigation loop',
    );
    await expect(page).toHaveURL(/\/hash-only#details$/);
  });

  test('a query redirect cycle stops at the follow limit', async ({ page }) => {
    // 20 intercepted follows through Vite; the suite's 30s test timeout
    // and a 30s expect both fire while the chain is still in flight on
    // chromium-dev
    test.slow();
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-bounce').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'too many redirect or 404 follows',
      { timeout: 90_000 },
    );
    await expect(page).toHaveURL(/\/bounce\?v=[ab]$/);
  });

  test('the owning follow count stays zero while an inner host exhausts', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`http://localhost:${port}/two-hosts`);
    await waitForHydration(page);
    await expect(page.getByTestId('two-hosts')).toHaveText('two hosts');
    await expect(
      page.getByTestId('second-host').getByTestId('follow-error'),
    ).toHaveText('too many redirect or 404 follows', { timeout: 30_000 });
    await expect(
      page.getByTestId('second-host').getByTestId('follow-count'),
    ).toHaveText('20');
    await expect(page.getByTestId('owning-follow-count')).toHaveText('0');
  });

  test('two spike instances can follow the same href', async ({ page }) => {
    await page.goto(`http://localhost:${port}/two-same-href`);
    await waitForHydration(page);
    await expect(page.getByTestId('two-same-href')).toHaveText('two same href');
    await expect(
      page.getByTestId('first-host').getByTestId('canonical'),
    ).toHaveText('Canonical new');
    await expect(
      page.getByTestId('second-host').getByTestId('canonical'),
    ).toHaveText('Canonical new');
  });

  test('useSetSearch replace after a follow gets a fresh budget', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-search-from-follow').click();
    await expect(page.getByTestId('search')).toHaveText('spent');
    await expect(page.getByTestId('owning-follow-count')).toHaveText('1');
    await page.getByTestId('set-search-replace').click();
    await expect(page.getByTestId('search')).toHaveText('x');
    await expect(page.getByTestId('owning-follow-count')).toHaveText('0');
  });

  test('a hash-only user navigation after a follow clears the count', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-search-from-follow').click();
    await expect(page.getByTestId('search')).toHaveText('spent');
    await expect(page.getByTestId('owning-follow-count')).toHaveText('1');
    await page.getByTestId('hash-a').click();
    await expect(page).toHaveURL(/\/search\?q=spent#a$/);
    await expect(page.getByTestId('owning-follow-count')).toHaveText('0');
  });

  test('a load follow then a slot revisit is not skipped as a replay', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/mix`);
    await waitForHydration(page);
    await expect(page.getByTestId('mix')).toHaveText('mix');
    // derived from the follow contract, not from a prior run:
    //   slot mix-a → /mix-b?mix=1 (1)
    //   load: mix-b RSC is HTTP 404, so decideFollow hops to /404?mix=1 (2)
    //   slot 404 → /mix-b?mix=1 (3)
    //   load 404-follows to /404?mix=1 (4); path is already /404, so the
    //   boundary does not remount and the chain stalls.
    // omitting setFollows(outcome.follows) resumes the second slot from 1
    // and leaves the count at 2. a 200 404-page for mix-b skips both load
    // hops and also leaves it at 2.
    await expect(
      page.getByTestId('mix-host').getByTestId('follow-count'),
    ).toHaveText('4');
    await expect(
      page.getByTestId('mix-host').getByTestId('follow-error'),
    ).toHaveCount(0);
  });

  test('a mixed slot and load follow chain stops at the follow limit', async ({
    page,
  }) => {
    // mixcycle remounts FollowBoundary on each 404 slot throw; load hops
    // to /404 in between. both share MAX_FOLLOWS_PER_NAVIGATION: 10 load
    // hops (mix-b RSC) plus 10 slot hops hit 20. omitting
    // setFollows(outcome.follows), slots still display 20 and mix-b is
    // fetched ~20 times.
    test.setTimeout(60_000);
    let mixBFetches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/RSC/R/mix-b.txt') {
        mixBFetches += 1;
      }
    });
    await page.goto(`http://localhost:${port}/mix-budget`);
    await waitForHydration(page);
    await expect(page.getByTestId('mix-budget')).toHaveText('mix budget');
    await expect(
      page.getByTestId('mix-budget-host').getByTestId('follow-error'),
    ).toHaveText('too many redirect or 404 follows', { timeout: 30_000 });
    await expect(
      page.getByTestId('mix-budget-host').getByTestId('follow-count'),
    ).toHaveText('20');
    expect(mixBFetches).toBe(10);
  });

  test('setSearch does not reset scroll', async ({ page }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await page.getByTestId('set-search').evaluate((el: HTMLButtonElement) => {
      el.click();
    });
    await expect(page.getByTestId('search')).toHaveText('x');
    await page.evaluate(() => window.navigation.transition?.finished);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
