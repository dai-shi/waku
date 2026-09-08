import { describe, expect, test, vi } from 'vitest';
import {
  createCustomError,
  getErrorInfo,
} from '../src/lib/utils/custom-errors.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const readText = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  return decoder.decode(
    Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk))),
  );
};

const rsdwClient = vi.hoisted(() => ({
  createFromReadableStream: vi.fn((stream: ReadableStream<Uint8Array>) =>
    readText(stream),
  ),
}));

const rsdwServer = vi.hoisted(() => ({
  renderToReadableStream: vi.fn(
    (element: unknown, _webpackMap: object, _options?: object) => {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(String(element)));
          controller.close();
        },
      });
    },
  ),
}));

vi.mock('react-server-dom-webpack/client.edge', () => ({
  createFromReadableStream: rsdwClient.createFromReadableStream,
}));

vi.mock('react-server-dom-webpack/server.edge', () => ({
  renderToReadableStream: rsdwServer.renderToReadableStream,
}));

describe('waku/server RSC helpers', () => {
  test('serializeRsc and deserializeRsc operate on one element', async () => {
    const { deserializeRsc, serializeRsc } = await import('../src/server.js');

    const bytes = await serializeRsc('cached element');
    expect(decoder.decode(bytes)).toBe('cached element');
    expect(rsdwServer.renderToReadableStream).toHaveBeenCalledWith(
      'cached element',
      {},
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    await expect(deserializeRsc(bytes)).resolves.toBe('cached element');
    expect(rsdwClient.createFromReadableStream).toHaveBeenCalledWith(
      expect.any(ReadableStream),
    );
  });

  test('serializeRsc returns a waku digest and logs anything else', async () => {
    const { serializeRsc } = await import('../src/server.js');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await serializeRsc('element');
      const options = rsdwServer.renderToReadableStream.mock.calls.at(
        -1,
      )![2] as {
        onError: (e: unknown) => string | undefined;
      };

      // react stores whatever onError returns as the error's digest
      const custom = createCustomError('not found', { status: 404 });
      expect(getErrorInfo({ digest: options.onError(custom) })).toEqual({
        status: 404,
      });
      expect(consoleError).not.toHaveBeenCalled();

      expect(options.onError(new Error('boom'))).toBeUndefined();
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});
