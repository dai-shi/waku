// @vitest-environment happy-dom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as minimalClient from '../src/minimal/client.js';
import { getRouterCache } from '../src/router/client-core-utils/caches.js';
import type { FetchRsc } from '../src/router/client-core-utils/caches.js';
import { RouterContext } from '../src/router/client-utils/router-context.js';
import type { ChangeRoute } from '../src/router/client-utils/router-context.js';
import { Link, useRouter } from '../src/router/client.js';
import { unstable_createRouteHref } from '../src/router/href-factory.js';
import { encodeRoutePath } from '../src/router/isomorphic-utils/router-protocol.js';

const href = '/artifacts/a%20b%2Fc?download=1#details';
const route = {
  path: '/artifacts/a%20b%2Fc',
  query: 'download=1',
  hash: '#details',
};
const artifact = unstable_createRouteHref({
  path: '/artifacts/[id]',
  search: {
    parse: (query: string) => ({
      download: Number(new URLSearchParams(query).get('download')),
    }),
    serialize: (search: { download: number }) =>
      new URLSearchParams({ download: String(search.download) }).toString(),
  },
});
const buildHref = () =>
  artifact({
    params: { id: 'a b/c' },
    search: { download: 1 },
    hash: 'details',
  });

const roots: ReturnType<typeof createRoot>[] = [];
let fetchRsc: ReturnType<typeof vi.fn<FetchRsc>>;
const preload = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__WAKU_ROUTER_PREFETCH__', preload);
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/base/');
  window.history.replaceState({}, '', '/base/start');
  fetchRsc = vi.fn<FetchRsc>().mockResolvedValue({});
  vi.spyOn(minimalClient, 'useFetchRsc_UNSTABLE').mockReturnValue(fetchRsc);
  preload.mockClear();
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  getRouterCache(fetchRsc).clearCaches();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const mount = async (children?: ReactNode) => {
  const changeRoute = vi.fn<ChangeRoute>().mockResolvedValue(undefined);
  let router!: ReturnType<typeof useRouter>;
  const Probe = () => {
    router = useRouter();
    return null;
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
        }}
      >
        <Probe />
        {children}
      </RouterContext>,
    );
  });
  return { container, changeRoute, router };
};

describe('string-producing factories with ordinary navigation', () => {
  test('Link SSR accepts eager hrefs and applies the base without resolving codecs', () => {
    const builtHref = buildHref();
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <>
        <Link to={href}>string</Link>
        <Link to={builtHref}>artifact</Link>
      </>,
    );

    expect(
      Array.from(container.querySelectorAll('a'), (a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/base' + href, '/base' + href]);
    expect(fetchRsc).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
  });

  test('Link hover prefetch and click preserve the encoded href under the base', async () => {
    const builtHref = buildHref();
    const prefetchRoute = vi.spyOn(getRouterCache(fetchRsc), 'prefetchRoute');
    const { container, changeRoute } = await mount(
      <>
        <Link to={href} unstable_prefetchOnEnter={{ mode: 'once' }}>
          string
        </Link>
        <Link to={builtHref} unstable_prefetchOnEnter={{ mode: 'once' }}>
          artifact
        </Link>
      </>,
    );

    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toBe('/base' + href);
      await act(async () => {
        link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      await act(async () => {
        link.dispatchEvent(click);
      });
      expect(click.defaultPrevented).toBe(true);
    }

    expect(prefetchRoute).toHaveBeenCalledTimes(2);
    expect(prefetchRoute).toHaveBeenCalledWith(route, { mode: 'once' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath(route.path),
      new URLSearchParams({ query: route.query }),
      expect.any(Object),
    );
    expect(changeRoute).toHaveBeenCalledTimes(2);
    for (const [next, options] of changeRoute.mock.calls) {
      expect(next).toEqual(route);
      expect(options).toMatchObject({ history: 'push', shouldScroll: true });
      expect(options.url?.href).toBe(
        new URL('/base' + href, location.href).href,
      );
    }
  });

  test('useRouter push, replace and prefetch accept both factory output and ordinary strings', async () => {
    const builtHref = buildHref();
    const prefetchRoute = vi.spyOn(getRouterCache(fetchRsc), 'prefetchRoute');
    const { router, changeRoute } = await mount();

    await act(async () => {
      for (const to of [href, builtHref]) {
        await router.push(to);
        await router.replace(to);
        router.prefetch(to, { mode: 'once' });
      }
    });

    expect(
      changeRoute.mock.calls.map(([, options]) => options.history),
    ).toEqual(['push', 'replace', 'push', 'replace']);
    for (const [next, options] of changeRoute.mock.calls) {
      expect(next).toEqual(route);
      expect(options.url?.href).toBe(
        new URL('/base' + href, location.href).href,
      );
    }
    expect(prefetchRoute).toHaveBeenCalledTimes(2);
    expect(prefetchRoute).toHaveBeenCalledWith(route, { mode: 'once' });
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath(route.path),
      new URLSearchParams({ query: route.query }),
      expect.any(Object),
    );
  });
});
