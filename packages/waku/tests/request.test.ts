import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/lib/utils/config.js';
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import { ETAGS_HEADER } from '../src/lib/utils/etags.js';
import { getInput } from '../src/lib/utils/request.js';
import { encodeFuncId } from '../src/lib/utils/rsc-path.js';
import {
  unstable_formatRscUrl as formatRscUrl,
  unstable_parseRequest as parseRequest,
} from '../src/minimal/server.js';

const makeConfig = (options: Parameters<typeof resolveConfig>[0] = {}) => {
  const { vite: _vite, ...config } = resolveConfig(options);
  return config;
};

const getStatus = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return getErrorInfo(e)?.status;
  }
};

const makeRequest = (
  headers: HeadersInit = {},
  init: RequestInit = {},
  protocol = 'https',
) =>
  new Request(`${protocol}://app.test/RSC/F/foo/bar.txt`, {
    method: 'POST',
    body: '[]',
    headers,
    ...init,
  });

const makeInput = (req: Request, config = makeConfig()) =>
  getInput(
    req,
    config,
    undefined,
    vi.fn().mockResolvedValue([]),
    vi.fn(),
    vi.fn(),
    vi.fn().mockResolvedValue(vi.fn()),
  );

describe('getInput request URLs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { basePath: '/', rscBase: 'RSC' },
    { basePath: '/app/', rscBase: '_flight' },
  ])('agrees with public inspection using %j', async (options) => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', options.basePath);
    vi.stubEnv('WAKU_CONFIG_RSC_BASE', options.rscBase);
    const config = makeConfig(options);
    const document = new Request(
      `https://app.test${options.basePath}form?a=1`,
      { method: 'POST', body: new FormData() },
    );
    const inspectedDocument = parseRequest(document);
    expect(inspectedDocument).toMatchObject({
      type: 'http',
      pathname: '/form',
    });
    expect(await makeInput(document, config)).toMatchObject({
      type: 'http',
      pathname: '/form',
      tryAction: expect.any(Function),
    });
    expect(document.bodyUsed).toBe(false);

    const payload = new Request(
      formatRscUrl('widget', 'https://app.test/?query=hello'),
    );
    const inspectedPayload = parseRequest(payload);
    expect(inspectedPayload).toMatchObject({ type: 'rsc', rscPath: 'widget' });
    if (inspectedPayload?.type !== 'rsc') {
      throw new Error('expected RSC');
    }
    const input = await makeInput(payload, config);
    expect(input).toMatchObject({
      type: 'rsc',
      rscPath: inspectedPayload.rscPath,
      pathname: `/${options.rscBase}/widget.txt`,
      rscParams: inspectedPayload.rscParams,
    });
    expect(inspectedPayload.rscParams?.get('query')).toBe('hello');

    const action = new Request(
      formatRscUrl(encodeFuncId('actions.ts#save'), 'https://app.test/'),
      { method: 'POST', body: '[]', headers: { origin: 'https://app.test' } },
    );
    expect(parseRequest(action)).toEqual({ type: 'call' });
    expect(action.bodyUsed).toBe(false);
    expect(await makeInput(action, config)).toMatchObject({
      type: 'call',
      pathname: `/${options.rscBase}/F/actions.ts/save.txt`,
      args: [],
    });
  });

  it('decodes body-backed RSC params only during dispatch', async () => {
    const req = new Request(formatRscUrl('widget', 'https://app.test/'), {
      method: 'POST',
      body: 'encoded params',
    });
    expect(parseRequest(req)).toEqual({
      type: 'rsc',
      rscPath: 'widget',
      rscParams: undefined,
    });
    expect(req.bodyUsed).toBe(false);
    expect(await makeInput(req)).toMatchObject({
      type: 'rsc',
      rscPath: 'widget',
      rscParams: [],
    });
    expect(req.bodyUsed).toBe(true);
  });

  it('rejects invalid URLs that public inspection declines', async () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    const config = makeConfig({ basePath: '/app/' });
    const outside = new Request('https://app.test/outside');
    const malformed = new Request('https://app.test/app/RSC/not-encoded');
    expect(parseRequest(outside)).toBeNull();
    expect(parseRequest(malformed)).toBeNull();
    await expect(makeInput(outside, config)).rejects.toThrow(
      'pathname must start with basePath',
    );
    await expect(makeInput(malformed, config)).rejects.toThrow(
      'Invalid encoded rscPath',
    );
  });
});

describe('getInput server action request validation', () => {
  it('accepts same-origin server function requests over HTTPS', async () => {
    const input = await makeInput(
      makeRequest({ origin: 'https://app.test' }, {}, 'https'),
    );

    expect(input.type).toBe('call');
  });

  it('accepts same-origin server function requests over HTTP', async () => {
    const input = await makeInput(
      makeRequest({ origin: 'http://app.test' }, {}, 'http'),
    );

    expect(input.type).toBe('call');
  });

  it('accepts an HTTPS origin when a reverse proxy forwards over HTTP', async () => {
    const input = await makeInput(
      makeRequest({ origin: 'https://app.test' }, {}, 'http'),
    );

    expect(input.type).toBe('call');
  });

  it('rejects an HTTP origin for an HTTPS request URL', async () => {
    await expect(
      getStatus(
        makeInput(makeRequest({ origin: 'http://app.test' }, {}, 'https')),
      ),
    ).resolves.toBe(403);
  });

  for (const originProtocol of ['http', 'https'] as const) {
    for (const requestProtocol of ['http', 'https'] as const) {
      it(`rejects an ${originProtocol} origin from another host for an ${requestProtocol} request URL`, async () => {
        const request = makeRequest(
          { origin: `${originProtocol}://evil.test` },
          {},
          requestProtocol,
        );
        await expect(getStatus(makeInput(request))).resolves.toBe(403);
      });
    }
  }

  it('rejects origin in non http scheme', async () => {
    for (const scheme of ['ftp', 'file', 'data'] as const) {
      await expect(
        getStatus(
          makeInput(
            makeRequest({ origin: `${scheme}://evil.test` }, {}, 'http'),
          ),
        ),
      ).resolves.toBe(403);

      await expect(
        getStatus(
          makeInput(
            makeRequest({ origin: `${scheme}://evil.test` }, {}, 'https'),
          ),
        ),
      ).resolves.toBe(403);
    }
  });

  it('rejects server function requests with non-POST methods', async () => {
    await expect(
      getStatus(makeInput(makeRequest({}, { method: 'GET', body: null }))),
    ).resolves.toBe(405);
  });

  it('rejects cross-origin server function requests', async () => {
    await expect(
      getStatus(makeInput(makeRequest({ origin: 'https://evil.test' }))),
    ).resolves.toBe(403);
  });

  it('rejects opaque-origin server function requests', async () => {
    await expect(
      getStatus(makeInput(makeRequest({ origin: 'null' }))),
    ).resolves.toBe(403);
  });

  it('rejects malformed-origin server function requests', async () => {
    await expect(
      getStatus(makeInput(makeRequest({ origin: 'malformed' }))),
    ).resolves.toBe(403);
  });

  it('rejects server function requests with cross-site fetch metadata', async () => {
    await expect(
      getStatus(
        makeInput(
          makeRequest({
            'sec-fetch-site': 'cross-site',
          }),
        ),
      ),
    ).resolves.toBe(403);
  });

  it('accepts server function requests with same-origin fetch metadata', async () => {
    const input = await makeInput(
      makeRequest({ 'sec-fetch-site': 'same-origin' }),
    );

    expect(input.type).toBe('call');
  });

  it('accepts user-initiated server function requests (sec-fetch-site: none)', async () => {
    const input = await makeInput(makeRequest({ 'sec-fetch-site': 'none' }));

    expect(input.type).toBe('call');
  });

  it('accepts server function requests after middleware rewrites origin', async () => {
    const input = await makeInput(
      makeRequest({
        origin: 'https://app.test',
        'sec-fetch-site': 'cross-site',
        'x-original-origin': 'https://trusted.test',
      }),
    );

    expect(input.type).toBe('call');
  });

  it('delivers cross-origin multipart posts without an action reference', async () => {
    const formData = new FormData();
    formData.set('key', 'value');

    const input = await getInput(
      new Request('https://app.test/', {
        method: 'POST',
        body: formData,
        headers: { origin: 'https://evil.test' },
      }),
      makeConfig(),
      undefined,
      vi.fn(),
      vi.fn().mockResolvedValue(null),
      vi.fn(),
      vi.fn(),
    );

    if (input.type !== 'http') {
      throw new Error('unreachable');
    }
    await expect(input.tryAction!()).resolves.toMatchObject({ action: false });
  });

  it('rejects cross-origin posts only when an action is decoded', async () => {
    const formData = new FormData();
    formData.set('key', 'value');
    const decodedAction = vi.fn();

    const input = await getInput(
      new Request('https://app.test/', {
        method: 'POST',
        body: formData,
        headers: { origin: 'https://evil.test' },
      }),
      makeConfig(),
      undefined,
      vi.fn(),
      vi.fn().mockResolvedValue(decodedAction),
      vi.fn(),
      vi.fn(),
    );

    if (input.type !== 'http') {
      throw new Error('unreachable');
    }
    await expect(getStatus(input.tryAction!())).resolves.toBe(403);
    expect(decodedAction).not.toHaveBeenCalled();
  });

  it('memoizes tryAction across calls', async () => {
    const formData = new FormData();
    formData.set('key', 'value');
    const decodeAction = vi.fn().mockResolvedValue(null);

    const input = await getInput(
      new Request('https://app.test/', {
        method: 'POST',
        body: formData,
        headers: { origin: 'https://app.test' },
      }),
      makeConfig(),
      undefined,
      vi.fn(),
      decodeAction,
      vi.fn(),
      vi.fn(),
    );

    if (input.type !== 'http') {
      throw new Error('unreachable');
    }
    const first = input.tryAction!();
    expect(input.tryAction!()).toBe(first);
    await first;
    expect(decodeAction).toHaveBeenCalledTimes(1);
  });

  it('resolves form action requests without an action reference as form data', async () => {
    const formData = new FormData();
    formData.set('key', 'value');

    const input = await getInput(
      new Request('https://app.test/', {
        method: 'POST',
        body: formData,
        headers: { origin: 'https://app.test' },
      }),
      makeConfig(),
      undefined,
      vi.fn(),
      vi.fn().mockReturnValue(null),
      vi.fn(),
      vi.fn(),
    );

    expect(input.type).toBe('http');
    if (input.type !== 'http') {
      throw new Error('unreachable');
    }
    const result = await input.tryAction!();
    expect(result).toMatchObject({ action: false });
    if (result.action) {
      throw new Error('unreachable');
    }
    expect(result.formData.get('key')).toBe('value');
  });
});

describe('getInput etags', () => {
  it('parses the etags header into input.etags', async () => {
    const input = await makeInput(
      makeRequest({
        origin: 'https://app.test',
        [ETAGS_HEADER]: JSON.stringify({ page: 'v1' }),
      }),
    );

    expect(input.etags).toEqual({ page: 'v1' });
  });

  it('defaults input.etags to {} for an absent or malformed header', async () => {
    const absent = await makeInput(makeRequest({ origin: 'https://app.test' }));
    expect(absent.etags).toEqual({});

    const malformed = await makeInput(
      makeRequest({ origin: 'https://app.test', [ETAGS_HEADER]: 'nope' }),
    );
    expect(malformed.etags).toEqual({});
  });
});
