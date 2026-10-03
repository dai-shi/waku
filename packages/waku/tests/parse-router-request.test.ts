import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeFuncId,
  encodeRscPath,
} from '../src/lib/utils-isomorphic/rsc-path.js';
import {
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/route-path.js';
import {
  formatRouterRequest,
  parseRouterRequest,
} from '../src/router/server-utils/parse-router-request.js';

const req = (url: string) => new Request(url);

// the url the client router actually fetches, envelope and all
const rscUrl = (routePath: string, query = '') =>
  'http://localhost/RSC/' +
  encodeRscPath(encodeRoutePath(routePath)) +
  '?' +
  new URLSearchParams({ query }).toString();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseRouterRequest', () => {
  it('reads a document request as its route', () => {
    expect(parseRouterRequest(req('http://localhost/dashboard'))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it('reads the rsc request for the same route identically', () => {
    expect(parseRouterRequest(req(rscUrl('/dashboard')))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it.each(['/', '/_foo', '/dashboard/invoices', '/a/b/c'])(
    'agrees between both url shapes for %s',
    (path) => {
      expect(parseRouterRequest(req(rscUrl(path)))).toEqual(
        parseRouterRequest(req('http://localhost' + path)),
      );
    },
  );

  it('keeps the query from either shape', () => {
    expect(parseRouterRequest(req('http://localhost/x?a=1'))).toMatchObject({
      query: 'a=1',
    });
    expect(parseRouterRequest(req(rscUrl('/x', 'a=1')))).toMatchObject({
      query: 'a=1',
    });
  });

  it('unwraps a multi-parameter query from an RSC url', () => {
    // the envelope is `?query=a%3D1%26b%3D2`, not `?a=1&b=2`
    expect(parseRouterRequest(req(rscUrl('/x', 'a=1&b=2')))).toMatchObject({
      query: 'a=1&b=2',
    });
  });

  it('narrows to the route members without a named type', () => {
    const parsed = parseRouterRequest(req('http://localhost/x?a=1'));
    if (parsed?.type !== 'route') {
      throw new Error('expected a route');
    }
    expect([parsed.path, parsed.query]).toEqual(['/x', 'a=1']);
  });

  it('reports an unknown query when the params ride in the body', () => {
    // what `fetchRsc` sends when a transformer returns anything but
    // `URLSearchParams`
    const bodyBacked = new Request(rscUrl('/x'), {
      method: 'POST',
      body: 'encoded-reply',
    });
    expect(parseRouterRequest(bodyBacked)).toEqual({
      type: 'route',
      path: '/x',
      query: undefined,
    });
  });

  it('reports an empty query for an RSC url with no envelope', () => {
    const url = 'http://localhost/RSC/' + encodeRscPath(encodeRoutePath('/x'));
    expect(parseRouterRequest(req(url))).toMatchObject({ query: '' });
  });

  it('reports a server action as an action, with no route', () => {
    const url =
      'http://localhost/RSC/' +
      encodeRscPath(encodeFuncId('src/actions.ts#deleteInvoice'));
    expect(parseRouterRequest(req(url))).toEqual({ type: 'action' });
  });

  it('reports a slice request', () => {
    const url = 'http://localhost/RSC/' + encodeRscPath(encodeSliceId('one'));
    expect(parseRouterRequest(req(url))).toEqual({ type: 'slice', id: 'one' });
  });

  it('honours a custom basePath and rscBase', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    vi.stubEnv('WAKU_CONFIG_RSC_BASE', '_rsc');
    expect(parseRouterRequest(req('http://localhost/app/dashboard'))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
    const url =
      'http://localhost/app/_rsc/' +
      encodeRscPath(encodeRoutePath('/dashboard'));
    expect(parseRouterRequest(req(url))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it('returns null outside basePath', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    expect(parseRouterRequest(req('http://localhost/elsewhere'))).toBeNull();
  });

  it('returns null for an undecodable rsc url', () => {
    expect(
      parseRouterRequest(req('http://localhost/RSC/not-encoded')),
    ).toBeNull();
  });

  it('reads a path with no route as a route: existence is the caller’s job', () => {
    expect(parseRouterRequest(req('http://localhost/favicon.ico'))).toEqual({
      type: 'route',
      path: '/favicon.ico',
      query: '',
    });
  });
});

describe('formatRouterRequest', () => {
  it('rewrites a document request to the document url of another route', () => {
    const out = formatRouterRequest(req('http://localhost/old'), '/new');
    expect(out?.pathname).toBe('/new');
  });

  it('rewrites an rsc request to the rsc url of another route', () => {
    const out = formatRouterRequest(req(rscUrl('/old')), '/new');
    expect(out?.pathname).toBe(new URL(rscUrl('/new')).pathname);
  });

  it('round-trips through parseRouterRequest', () => {
    for (const path of ['/', '/_foo', '/a/b/c']) {
      for (const from of ['http://localhost/old', rscUrl('/old')]) {
        const out = formatRouterRequest(req(from), path);
        expect(parseRouterRequest(req(out!.href))).toMatchObject({
          type: 'route',
          path,
        });
      }
    }
  });

  it('carries the original query unless one is given', () => {
    expect(
      formatRouterRequest(req('http://localhost/old?a=1'), '/new')?.search,
    ).toBe('?a=1');
    expect(
      formatRouterRequest(req('http://localhost/old?a=1'), '/new', 'b=2')
        ?.search,
    ).toBe('?b=2');
  });

  it('wraps the query again when rewriting an RSC url', () => {
    expect(
      formatRouterRequest(req(rscUrl('/old', 'a=1')), '/new')?.search,
    ).toBe('?query=a%3D1');
    expect(
      formatRouterRequest(req(rscUrl('/old', 'a=1')), '/new', 'b=2')?.search,
    ).toBe('?query=b%3D2');
  });

  it('round-trips a rewritten query through parseRouterRequest', () => {
    for (const original of [
      'http://localhost/old?a=1',
      rscUrl('/old', 'a=1'),
    ]) {
      const rewritten = formatRouterRequest(req(original), '/new', 'b=2&c=3');
      expect(parseRouterRequest(req(rewritten!.toString()))).toEqual({
        type: 'route',
        path: '/new',
        query: 'b=2&c=3',
      });
    }
  });

  it('refuses to rewrite a body-backed request', () => {
    const bodyBacked = () =>
      new Request(rscUrl('/old'), { method: 'POST', body: 'encoded-reply' });
    expect(formatRouterRequest(bodyBacked(), '/new')).toBe(null);
    // an explicit query cannot stand in for the rest of the payload either
    expect(formatRouterRequest(bodyBacked(), '/new', 'b=2')).toBe(null);
  });

  it('keeps envelope params a transformer added', () => {
    const withExtras =
      'http://localhost/RSC/' +
      encodeRscPath(encodeRoutePath('/old')) +
      '?' +
      new URLSearchParams({ query: 'a=1', tenant: 'acme' }).toString();
    const rewritten = formatRouterRequest(req(withExtras), '/new');
    expect(rewritten?.searchParams.get('tenant')).toBe('acme');
    expect(rewritten?.searchParams.get('query')).toBe('a=1');
  });

  it('canonicalizes a destination path in either shape', () => {
    expect(
      formatRouterRequest(req('http://localhost/old'), '/new/')?.pathname,
    ).toBe('/new');
    const rsc = formatRouterRequest(req(rscUrl('/old')), '/new/');
    expect(parseRouterRequest(req(rsc!.toString()))).toMatchObject({
      path: '/new',
    });
  });

  it('honours a custom basePath', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    expect(
      formatRouterRequest(req('http://localhost/app/old'), '/new')?.pathname,
    ).toBe('/app/new');
  });

  it('returns null for an action, which has no route to rewrite', () => {
    const url =
      'http://localhost/RSC/' + encodeRscPath(encodeFuncId('src/a.ts#go'));
    expect(formatRouterRequest(req(url), '/new')).toBeNull();
  });
});
