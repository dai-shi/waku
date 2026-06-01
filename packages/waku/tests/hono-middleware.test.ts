import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { middlewareRunner } from '../src/lib/hono/middleware.js';

describe('middlewareRunner', () => {
  test('preserves response returned by a middleware module', async () => {
    const app = new Hono();
    app.use(
      middlewareRunner(
        {
          '/src/middleware/no-trailing-slash.ts': async () => ({
            default: () => async (c) =>
              c.redirect(new URL('/about', c.req.url).toString(), 301),
          }),
        },
        { app },
      ),
    );
    app.get('*', (c) => c.text('ok'));

    const res = await app.request('http://example.com/about/');

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('http://example.com/about');
  });

  test('preserves response returned by an inner middleware module', async () => {
    const app = new Hono();
    app.use(
      middlewareRunner(
        {
          '/src/middleware/outer.ts': async () => ({
            default: () => async (_c, next) => {
              await next();
            },
          }),
          '/src/middleware/no-trailing-slash.ts': async () => ({
            default: () => async (c) =>
              c.redirect(new URL('/about', c.req.url).toString(), 301),
          }),
        },
        { app },
      ),
    );
    app.get('*', (c) => c.text('ok'));

    const res = await app.request('http://example.com/about/');

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('http://example.com/about');
  });

  test('keeps inner response even if outer middleware returns after next', async () => {
    const app = new Hono();
    app.use(
      middlewareRunner(
        {
          '/src/middleware/outer.ts': async () => ({
            default: () => async (_c, next) => {
              await next();
              return new Response('outer', { status: 202 });
            },
          }),
          '/src/middleware/inner.ts': async () => ({
            default: () => async () => new Response('inner', { status: 201 }),
          }),
        },
        { app },
      ),
    );
    app.get('*', (c) => c.text('ok'));

    const res = await app.request('http://example.com/about/');

    expect(res.status).toBe(201);
    expect(await res.text()).toBe('inner');
  });

  test('passes { app } to each middleware module factory', async () => {
    const app = new Hono();
    let receivedApp: unknown;
    app.use(
      middlewareRunner(
        {
          '/src/middleware/probe.ts': async () => ({
            default: ({ app }) => {
              receivedApp = app;
              return async (_c, next) => {
                await next();
              };
            },
          }),
        },
        { app },
      ),
    );
    app.get('*', (c) => c.text('ok'));

    await app.request('http://example.com/');

    expect(receivedApp).toBe(app);
  });
});
