import { describe, expect, test, vi } from 'vitest';
import { ETAGS_ID, IMMUTABLE_ETAG } from '../src/lib/utils-isomorphic/etags.js';
import { createRenderUtils } from '../src/lib/utils-server/render.js';
import { createHtmlFallback } from '../src/lib/utils-server/ssr.js';

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
  test('renders fallback documents with independent request nonces', async () => {
    const renderToReadableStream = vi.fn(() => new ReadableStream());
    const renderHtmlFallback = vi.fn(
      async (options?: Parameters<typeof createHtmlFallback>[2]) =>
        createHtmlFallback('<html><body></body></html>', '/entry.js', options),
    );
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () =>
        ({
          INTERNAL_renderHtmlFallback: renderHtmlFallback,
        }) as any,
      buildId: '',
      onError: vi.fn(),
    });
    const first = await renderUtils.renderHtmlFallback({
      nonce: 'first-nonce',
      unstable_extraScriptContent: 'globalThis.customBootstrap = true;',
    });
    const second = await renderUtils.renderHtmlFallback({
      nonce: 'second-nonce',
    });
    const plain = await renderUtils.renderHtmlFallback();
    expect(first.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const firstHtml = await first.text();
    expect(firstHtml).toContain('nonce="first-nonce"');
    expect(firstHtml).toContain('globalThis.customBootstrap = true;');
    const secondHtml = await second.text();
    expect(secondHtml).toContain('nonce="second-nonce"');
    expect(secondHtml).not.toContain('first-nonce');
    expect(secondHtml).not.toContain('customBootstrap');
    const plainHtml = await plain.text();
    expect(plainHtml).toContain('import("/entry.js");');
    expect(plainHtml).not.toContain('nonce=');
    expect(renderToReadableStream).not.toHaveBeenCalled();
  });

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

  test('attaches the etags option as one _etags object, past id validation', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc(
      { App: 'app' },
      { etags: { page: 'v1', slice: IMMUTABLE_ETAG } },
    );
    await renderUtils.renderRsc({ App: 'app' }, { etags: {} });

    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      1,
      { App: 'app', [ETAGS_ID]: { page: 'v1', slice: IMMUTABLE_ETAG } },
      expect.anything(),
      expect.anything(),
    );
    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      2,
      { App: 'app' },
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

  test('passes extra bootstrap code to the HTML renderer', async () => {
    const renderHtmlStream = vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
      status: undefined,
    });
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream: () => new ReadableStream(),
      loadSsrEntryModule: async () => ({
        INTERNAL_renderHtmlStream: renderHtmlStream,
        INTERNAL_renderHtmlFallback: vi.fn(),
      }),
      buildId: '',
      onError: vi.fn(),
    });

    await renderUtils.renderHtml(new ReadableStream(), 'app', {
      rscPath: '',
      unstable_extraScriptContent: 'globalThis.prefetch = true;',
    });

    expect(renderHtmlStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        extraScriptContent: 'globalThis.prefetch = true;',
      }),
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
