import { describe, expect, test, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { createRenderUtils } from '../src/lib/utils/render.js';

const makeRenderUtils = () => {
  const renderToReadableStream = vi.fn(
    (_data: unknown, _options?: object, _extraOptions?: object) =>
      new ReadableStream(),
  );
  const onError = vi.fn();
  const renderUtils = createRenderUtils({
    temporaryReferences: undefined,
    renderToReadableStream,
    loadSsrEntryModule: async () => ({}) as any,
    buildId: '',
    onError,
  });
  return { renderToReadableStream, renderUtils, onError };
};

describe('createRenderUtils', () => {
  test('carries a document location', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc(
      {},
      { documentLocation: 'https://other.example/x' },
    );

    expect(renderToReadableStream).toHaveBeenCalledWith(
      { _location: 'https://other.example/x' },
      expect.anything(),
      expect.anything(),
    );
  });

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

  test('creates a debug channel for each RSC render', async () => {
    const renderToReadableStream = vi.fn(() => new ReadableStream());
    const firstDebugChannel = {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    };
    const secondDebugChannel = {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    };
    const createDebugChannel = vi
      .fn()
      .mockReturnValueOnce(firstDebugChannel)
      .mockReturnValueOnce(secondDebugChannel);
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () => ({}) as any,
      buildId: '',
      createDebugChannel,
      onError: vi.fn(),
    });

    await renderUtils.renderRsc({ App: 'first' });
    await renderUtils.renderRsc({ App: 'second' });

    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ debugChannel: firstDebugChannel }),
      expect.anything(),
    );
    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ debugChannel: secondDebugChannel }),
      expect.anything(),
    );
    expect(createDebugChannel).toHaveBeenCalledTimes(2);
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
    const onError = vi.fn();
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () =>
        ({
          INTERNAL_renderHtmlStream: renderHtmlStream,
        }) as any,
      buildId: '',
      onError,
    });

    const res = await renderUtils.renderHtml(new ReadableStream(), 'app', {
      rscPath: '',
    });

    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  test('passes onError to the html render', async () => {
    const renderHtmlStream = vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
      status: undefined,
    });
    const onError = vi.fn();
    const renderToReadableStream = vi.fn(() => new ReadableStream());
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () =>
        ({ INTERNAL_renderHtmlStream: renderHtmlStream }) as any,
      buildId: '',
      onError,
    });

    await renderUtils.renderHtml(new ReadableStream(), 'app', { rscPath: '' });

    expect(renderToReadableStream).toHaveBeenCalledWith('app', { onError });
    expect(renderHtmlStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ onError }),
    );
  });

  test('passes onError to the RSC render', async () => {
    const { renderToReadableStream, renderUtils, onError } = makeRenderUtils();

    await renderUtils.renderRsc({ App: 'app' });

    expect(renderToReadableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onError }),
      expect.anything(),
    );
  });
});
