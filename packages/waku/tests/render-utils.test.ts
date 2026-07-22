import { describe, expect, test, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { createRenderUtils } from '../src/lib/utils/render.js';

const makeRenderUtils = () => {
  const renderToReadableStream = vi.fn(
    (_data: unknown, _options?: object, _extraOptions?: object) =>
      new ReadableStream(),
  );
  const renderUtils = createRenderUtils(
    undefined,
    renderToReadableStream,
    async () => ({}) as any,
    '',
  );
  return { renderToReadableStream, renderUtils };
};

describe('createRenderUtils', () => {
  test('adds server function value with the renderRsc value option', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc({ App: 'app' }, { value: undefined });

    expect(renderToReadableStream).toHaveBeenCalledWith(
      { App: 'app', _value: undefined },
      expect.anything(),
      expect.anything(),
    );
  });

  test('attaches _etag:<slot> keys from the etags option, past id validation', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc(
      { App: 'app' },
      { etags: { page: 'v1', slice: IMMUTABLE_ETAG } },
    );

    expect(renderToReadableStream).toHaveBeenCalledWith(
      expect.objectContaining({
        App: 'app',
        [`${ETAG_ID_PREFIX}page`]: 'v1',
        [`${ETAG_ID_PREFIX}slice`]: IMMUTABLE_ETAG,
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  test('rejects reserved RSC element IDs', async () => {
    const { renderUtils } = makeRenderUtils();

    await expect(renderUtils.renderRsc({ _foo: 'app' })).rejects.toThrow(
      'RSC element IDs starting with "_" are reserved for Waku internals: _foo',
    );
  });

  test('HTML response sets charset=utf-8 (full document reload decoding)', async () => {
    const renderToReadableStream = vi.fn(
      (_data: unknown, _options?: object, _extraOptions?: object) =>
        new ReadableStream(),
    );
    const fakeHtmlStream = new ReadableStream();
    const renderHtmlStream = vi.fn().mockResolvedValue({
      stream: fakeHtmlStream,
      status: undefined,
    });
    const renderUtils = createRenderUtils(
      undefined,
      renderToReadableStream,
      async () =>
        ({
          INTERNAL_renderHtmlStream: renderHtmlStream,
        }) as any,
      '',
    );

    const res = await renderUtils.renderHtml(new ReadableStream(), 'app', {
      rscPath: '',
    });

    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });
});
