import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  encodeFuncId,
  encodeRscPath,
} from '../src/lib/utils-isomorphic/rsc-path.js';
import {
  unstable_formatRscUrl as formatRscUrl,
  unstable_parseRequest as parseRequest,
} from '../src/minimal/server.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Minimal request URLs', () => {
  test('HTTP inspection preserves the pathname and query for form posts too', () => {
    const req = new Request('https://example.com/form?a=1', {
      method: 'POST',
      body: new URLSearchParams({ field: 'value' }),
    });
    const parsed = parseRequest(req);
    expect(parsed).toMatchObject({ type: 'http', pathname: '/form' });
    if (parsed?.type !== 'http') {
      throw new Error('expected HTTP');
    }
    expect(parsed.searchParams.toString()).toBe('a=1');
    expect(req.bodyUsed).toBe(false);
  });

  test.each(['', '/leading', 'trailing/', '_both_', 'nested/input'])(
    'formats and inspects opaque RSC path %j',
    (rscPath) => {
      const url = formatRscUrl(rscPath, 'https://example.com/old?param=value');
      expect(url.pathname).toBe('/RSC/' + encodeRscPath(rscPath));
      const parsed = parseRequest(new Request(url));
      expect(parsed).toMatchObject({ type: 'rsc', rscPath });
      if (parsed?.type !== 'rsc') {
        throw new Error('expected RSC');
      }
      expect(parsed.rscParams?.get('param')).toBe('value');
    },
  );

  test('body-backed RSC params are unknown and the body stays readable', async () => {
    const req = new Request(formatRscUrl('widget', 'https://example.com/'), {
      method: 'POST',
      body: 'encoded params',
    });
    expect(parseRequest(req)).toEqual({
      type: 'rsc',
      rscPath: 'widget',
      rscParams: undefined,
    });
    expect(await req.text()).toBe('encoded params');
  });

  test('server-call URLs are distinct from payload URLs', () => {
    const url = formatRscUrl(
      encodeFuncId('src/actions.ts#save'),
      'https://example.com/',
    );
    expect(parseRequest(new Request(url))).toEqual({ type: 'call' });
  });

  test('honors the configured base path and RSC endpoint', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    vi.stubEnv('WAKU_CONFIG_RSC_BASE', '_flight');
    const url = formatRscUrl('widget', 'https://example.com/app/?x=1');
    expect(url.href).toBe('https://example.com/app/_flight/widget.txt?x=1');
    expect(parseRequest(new Request(url))).toMatchObject({
      type: 'rsc',
      rscPath: 'widget',
    });
    expect(parseRequest(new Request('https://example.com/outside'))).toBeNull();
    expect(
      parseRequest(new Request('https://example.com/app/_flight/invalid')),
    ).toBeNull();
  });
});
