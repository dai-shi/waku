import { describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../src/lib/utils/config.js';
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import { ETAGS_HEADER } from '../src/lib/utils/etags.js';
import { getInput } from '../src/lib/utils/request.js';

const makeConfig = () => {
  const { vite: _vite, ...config } = resolveConfig({});
  return config;
};

const getStatus = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return getErrorInfo(e)?.status;
  }
};

const makeRequest = (headers: HeadersInit = {}, init: RequestInit = {}) =>
  new Request('https://app.test/RSC/F/foo/bar.txt', {
    method: 'POST',
    body: '[]',
    headers,
    ...init,
  });

const makeInput = (req: Request) =>
  getInput(
    req,
    makeConfig(),
    undefined,
    vi.fn().mockResolvedValue([]),
    vi.fn(),
    vi.fn(),
    vi.fn().mockResolvedValue(vi.fn()),
  );

describe('getInput server action request validation', () => {
  it('accepts same-origin server function requests', async () => {
    const input = await makeInput(makeRequest({ origin: 'https://app.test' }));

    expect(input.type).toBe('function');
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

    expect(input.type).toBe('function');
  });

  it('accepts user-initiated server function requests (sec-fetch-site: none)', async () => {
    const input = await makeInput(makeRequest({ 'sec-fetch-site': 'none' }));

    expect(input.type).toBe('function');
  });

  it('accepts server function requests after middleware rewrites origin', async () => {
    const input = await makeInput(
      makeRequest({
        origin: 'https://app.test',
        'sec-fetch-site': 'cross-site',
        'x-original-origin': 'https://trusted.test',
      }),
    );

    expect(input.type).toBe('function');
  });

  it('rejects cross-origin form action requests', async () => {
    const formData = new FormData();
    formData.set('key', 'value');

    await expect(
      getStatus(
        getInput(
          new Request('https://app.test/', {
            method: 'POST',
            body: formData,
            headers: { origin: 'https://evil.test' },
          }),
          makeConfig(),
          undefined,
          vi.fn(),
          vi.fn(),
          vi.fn(),
          vi.fn(),
        ),
      ),
    ).resolves.toBe(403);
  });

  it('rejects form action requests without an action reference', async () => {
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

    expect(input.type).toBe('action');
    if (input.type !== 'action') {
      throw new Error('unreachable');
    }
    await expect(getStatus(input.fn())).resolves.toBe(400);
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
