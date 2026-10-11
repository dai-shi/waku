import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-nonce-middleware');

test.describe(`ssr-nonce-middleware`, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('should have nonce in CSP header and raw HTML', async ({ request }) => {
    const response = await request.get(`http://localhost:${port}/`);
    const html = await response.text();

    // Check CSP header has nonce
    const cspHeader = response.headers()['content-security-policy'];
    expect(cspHeader).toMatch(/'nonce-[^']+'/);

    // Check raw HTML has script tags with nonce attribute
    expect(html).toMatch(/nonce="[^"]+"/);
  });

  test('page renders correctly without CSP violations', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy')) {
        cspViolations.push(msg.text());
      }
    });

    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Nonce Middleware Test');
    await expect(page.getByTestId('message')).toHaveText(
      'Hello from SSR with nonce via middleware!',
    );

    // No CSP violations should occur
    expect(cspViolations).toHaveLength(0);
  });

  test('dynamic no-SSR responses keep their bootstrap nonce request-local', async ({
    request,
  }) => {
    const url = `http://localhost:${port}/no-ssr`;
    const responses = await Promise.all([request.get(url), request.get(url)]);
    const nonces: string[] = [];
    const documents: string[] = [];
    for (const response of responses) {
      expect(response.status()).toBe(200);
      const cspHeader = response.headers()['content-security-policy'];
      const nonce = cspHeader?.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      nonces.push(nonce!);
      const html = await response.text();
      documents.push(html);
      expect(html).not.toContain('Hello from a dynamic page without SSR!');
      expect(html).not.toContain('__WAKU_HYDRATE__');
      expect(html).not.toContain('__WAKU_INITIAL_RSC__');
      const scriptNonces = [
        ...html.matchAll(/<script[^>]*nonce="([^"]+)"/g),
      ].map((match) => match[1]);
      expect(scriptNonces.length).toBeGreaterThan(0);
      expect(scriptNonces.every((value) => value === nonce)).toBe(true);
      expect(html).toMatch(/<script[^>]*nonce="[^"]+"[^>]*>[\s\S]*?import\(/);
    }
    expect(nonces[0]).not.toBe(nonces[1]);
    expect(documents[0]).not.toContain(nonces[1]!);
    expect(documents[1]).not.toContain(nonces[0]!);
  });

  test('dynamic no-SSR page loads under its response CSP nonce', async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy')) {
        cspViolations.push(msg.text());
      }
    });

    for (let i = 0; i < 2; i++) {
      const response = await page.goto(`http://localhost:${port}/no-ssr`);
      expect(response?.status()).toBe(200);
      const cspHeader = response?.headers()['content-security-policy'];
      const nonce = cspHeader?.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      await expect(page.getByTestId('title')).toHaveText('No SSR Nonce Test');
      await expect(page.getByTestId('message')).toHaveText(
        'Hello from a dynamic page without SSR!',
      );
      expect(
        await page
          .locator('script[nonce]')
          .evaluateAll((scripts) =>
            scripts.map((script) => (script as HTMLScriptElement).nonce),
          ),
      ).toContain(nonce);
    }
    expect(cspViolations).toHaveLength(0);
  });
});
