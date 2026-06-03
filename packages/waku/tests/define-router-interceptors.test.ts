import type { ReactNode } from 'react';
import { createElement } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import { createPages } from '../src/router/create-pages.js';
import {
  type HandlerInterceptor,
  unstable_getRequest as getRequest,
  unstable_defineRouter,
} from '../src/router/define-router.js';
import { fsRouter } from '../src/router/fs-router.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

const make404Router = (
  renderer: () => ReactNode,
  unstable_interceptors: HandlerInterceptor[],
) =>
  unstable_defineRouter({
    getConfigs: async () => [
      {
        type: 'route' as const,
        path: [{ type: 'literal' as const, name: '404' }],
        isStatic: false,
        rootElement: { isStatic: false, renderer: () => 'root' },
        routeElement: { isStatic: false, renderer },
        elements: {},
      },
    ],
    unstable_interceptors,
  });

const callHandleRequest = (
  router: ReturnType<typeof unstable_defineRouter>,
  pathname = '/missing',
) =>
  router.handleRequest(
    {
      type: 'custom',
      pathname,
      req: new Request(`http://localhost${pathname}`),
    },
    {
      renderRsc: vi.fn().mockResolvedValue(makeStream()),
      parseRsc: vi.fn(),
      renderHtml: vi.fn().mockResolvedValue(new Response('ok')),
      loadBuildMetadata: vi.fn(),
    },
  );

const callHandleBuild = (router: ReturnType<typeof unstable_defineRouter>) =>
  router.handleBuild({
    renderRsc: vi.fn().mockResolvedValue(makeStream()),
    parseRsc: vi.fn(),
    renderHtml: vi.fn().mockResolvedValue(new Response('ok')),
    rscPath2pathname: (rscPath: string) => '/' + rscPath,
    saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
    generateFile: vi.fn().mockResolvedValue(undefined),
    generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
    unstable_registerPrunableFile: vi.fn(),
  });

const orderingInterceptor =
  (label: string, order: string[]): HandlerInterceptor =>
  async (next) => {
    order.push(`${label}:before`);
    const res = await next();
    order.push(`${label}:after`);
    return res;
  };

describe('define-router handler interceptors', () => {
  it('runs interceptors around the handler in order (outermost first)', async () => {
    const order: string[] = [];
    const router = make404Router(() => {
      order.push('render');
      return 'route';
    }, [
      async (next) => {
        order.push('a:before');
        const res = await next();
        order.push('a:after');
        return res;
      },
      async (next) => {
        order.push('b:before');
        const res = await next();
        order.push('b:after');
        return res;
      },
    ]);

    await callHandleRequest(router);

    expect(order[0]).toBe('a:before');
    expect(order[1]).toBe('b:before');
    expect(order.includes('render')).toBe(true);
    expect(order.at(-1)).toBe('a:after');
    expect(order.at(-2)).toBe('b:after');
  });

  it('exposes an interceptor-established ALS to the render', async () => {
    const als = new AsyncLocalStorage<string>();
    let seen: string | undefined;
    const router = make404Router(() => {
      seen = als.getStore();
      return 'route';
    }, [(next) => als.run('from-interceptor', next)]);

    await callHandleRequest(router);

    expect(seen).toBe('from-interceptor');
  });

  it('runs createInterceptor-registered interceptors in createPages', async () => {
    const calls: string[] = [];
    const router = createPages(async ({ createPage, createInterceptor }) => {
      createInterceptor(async (next) => {
        calls.push('intercept');
        return next();
      });
      return [
        createPage({
          render: 'dynamic',
          path: '/',
          component: () => createElement('div'),
        }),
      ];
    });

    await callHandleRequest(router, '/');

    expect(calls).toEqual(['intercept']);
  });

  it('runs createInterceptor interceptors in registration order (outermost first)', async () => {
    const order: string[] = [];
    const router = createPages(async ({ createPage, createInterceptor }) => {
      createInterceptor(orderingInterceptor('a', order));
      createInterceptor(orderingInterceptor('b', order));
      return [
        createPage({
          render: 'dynamic',
          path: '/',
          component: () => createElement('div'),
        }),
      ];
    });

    await callHandleRequest(router, '/');

    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('registers fsRouter _interceptors in sorted order', async () => {
    const order: string[] = [];
    const router = fsRouter({
      './pages/index.tsx': async () => ({
        default: () => createElement('div'),
      }),
      './pages/_interceptors/a.ts': async () => ({
        default: orderingInterceptor('a', order),
      }),
      './pages/_interceptors/b.ts': async () => ({
        default: orderingInterceptor('b', order),
      }),
    });

    await callHandleRequest(router, '/');

    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('runs interceptors around static build renders of dynamic routes', async () => {
    const als = new AsyncLocalStorage<string>();
    let seen: string | undefined;
    let seenUrl: string | undefined;
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'dyn' }],
          // dynamic route: its static root/layout elements still pre-render
          isStatic: false,
          rootElement: {
            isStatic: true,
            renderer: () => {
              seen = als.getStore();
              seenUrl = getRequest().url;
              return 'root';
            },
          },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
      unstable_interceptors: [(next) => als.run('from-build', next)],
    });

    await callHandleBuild(router);

    expect(seen).toBe('from-build');
    expect(seenUrl).toContain('/dyn');
  });

  it('runs interceptors around the deferred static-route html render', async () => {
    const als = new AsyncLocalStorage<string>();
    let seenInHtml: string | undefined;
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'static' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => 'root' },
          routeElement: { isStatic: true, renderer: () => 'route' },
          elements: {},
        },
      ],
      unstable_interceptors: [(next) => als.run('from-build', next)],
    });

    await router.handleBuild({
      renderRsc: vi.fn().mockResolvedValue(makeStream()),
      parseRsc: vi.fn(),
      // The static HTML render is deferred; it must still run in scope.
      renderHtml: vi.fn().mockImplementation(async () => {
        seenInHtml = als.getStore();
        return new Response('ok');
      }),
      rscPath2pathname: (rscPath: string) => '/' + rscPath,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    expect(seenInHtml).toBe('from-build');
  });
});
