// Utility functions for web streams (not Node.js streams)

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const stringToStream = (str: string): ReadableStream => {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

export const streamToBytes = async (
  stream: ReadableStream,
): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (!(value instanceof Uint8Array)) {
      throw new Error('Unexpected buffer type');
    }
    chunks.push(value);
  }
  return concatUint8Array(chunks);
};

export const bytesToStream = (bytes: Uint8Array): ReadableStream =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

function concatUint8Array(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function batchReadableStream(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const buffer: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flushBuffer = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    clearTimeout(timer);
    timer = undefined;
    if (buffer.length) {
      try {
        controller.enqueue(concatUint8Array(buffer));
      } catch {
        // ignore errors
        // ref: https://github.com/wakujs/waku/pull/1863#discussion_r2634546953
      }
      buffer.length = 0;
    }
  };

  return input.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer.push(chunk);
        if (!timer) {
          timer = setTimeout(() => flushBuffer(controller));
        }
      },
      flush(controller) {
        flushBuffer(controller);
      },
    }),
  );
}

export function deferReadableStream<T>(
  stream: ReadableStream<T>,
  promise: Promise<void>,
): ReadableStream<T> {
  const reader = stream.getReader();
  let canceled = false;
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await promise;
          if (!canceled) {
            controller.close();
          }
          reader.releaseLock();
          return;
        }
        if (!canceled) {
          controller.enqueue(value);
        }
      } catch (error) {
        if (!canceled) {
          controller.error(error);
        }
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      canceled = true;
      try {
        await reader.cancel(reason);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

// Stream Multiplexer

const FRAME_START = 0x01;
const FRAME_CHUNK = 0x02;
const FRAME_END = 0x03;
const FRAME_ERROR = 0x04;

function encodeStart(key: string): Uint8Array {
  const keyBytes = encoder.encode(key);
  const out = new Uint8Array(1 + 2 + keyBytes.length);
  out[0] = FRAME_START;
  new DataView(out.buffer).setUint16(1, keyBytes.length);
  out.set(keyBytes, 3);
  return out;
}

function encodeEnd(key: string): Uint8Array {
  const keyBytes = encoder.encode(key);
  const out = new Uint8Array(1 + 2 + keyBytes.length);
  out[0] = FRAME_END;
  new DataView(out.buffer).setUint16(1, keyBytes.length);
  out.set(keyBytes, 3);
  return out;
}

function encodeChunk(key: string, chunk: Uint8Array): Uint8Array {
  const keyBytes = encoder.encode(key);
  const out = new Uint8Array(1 + 2 + keyBytes.length + 4 + chunk.length);
  let offset = 0;
  out[offset++] = FRAME_CHUNK;
  new DataView(out.buffer).setUint16(offset, keyBytes.length);
  offset += 2;
  out.set(keyBytes, offset);
  offset += keyBytes.length;
  new DataView(out.buffer).setUint32(offset, chunk.length);
  offset += 4;
  out.set(chunk, offset);
  return out;
}

function encodeError(key: string, error: unknown): Uint8Array {
  const keyBytes = encoder.encode(key);
  const payload = encoder.encode(String(error));
  const out = new Uint8Array(1 + 2 + keyBytes.length + 4 + payload.length);
  let offset = 0;
  out[offset++] = FRAME_ERROR;
  new DataView(out.buffer).setUint16(offset, keyBytes.length);
  offset += 2;
  out.set(keyBytes, offset);
  offset += keyBytes.length;
  new DataView(out.buffer).setUint32(offset, payload.length);
  offset += 4;
  out.set(payload, offset);
  return out;
}

function createFrameDispatcher(
  onStart: (key: string) => void,
  onChunk: (key: string, chunk: Uint8Array) => void,
  onEnd: (key: string) => void,
  onError: (key: string, error: string) => void,
): (data: Uint8Array) => void {
  let buffer: Uint8Array = new Uint8Array(0);

  return (data: Uint8Array): void => {
    buffer = concatUint8Array([buffer, data]);

    while (buffer.length > 0) {
      const frameType = buffer[0]!;
      // Need at least frameType + 2 byte key length
      if (buffer.length < 3) {
        break;
      }
      const keyLen = new DataView(buffer.buffer, buffer.byteOffset).getUint16(
        1,
      );
      const headerLen = 1 + 2 + keyLen;
      if (buffer.length < headerLen) {
        break;
      }
      const key = decoder.decode(buffer.slice(3, 3 + keyLen));

      if (frameType === FRAME_START) {
        onStart(key);
        buffer = buffer.slice(headerLen);
        continue;
      }
      if (frameType === FRAME_END) {
        onEnd(key);
        buffer = buffer.slice(headerLen);
        continue;
      }
      // chunk or error: need 4 byte payload length
      if (buffer.length < headerLen + 4) {
        break;
      }
      const payloadLen = new DataView(
        buffer.buffer,
        buffer.byteOffset,
      ).getUint32(headerLen);
      const totalLen = headerLen + 4 + payloadLen;
      if (buffer.length < totalLen) {
        break;
      }
      const payload = buffer.slice(headerLen + 4, totalLen);

      if (frameType === FRAME_CHUNK) {
        onChunk(key, payload);
      } else if (frameType === FRAME_ERROR) {
        onError(key, decoder.decode(payload));
      } else {
        throw new Error(`Unknown frame type: ${frameType}`);
      }
      buffer = buffer.slice(totalLen);
    }
  };
}

export function produceMultiplexedStream(
  fn: (
    callback: (key: string, stream: ReadableStream) => Promise<void>,
  ) => Promise<void>,
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const frameStream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const callback = async (key: string, stream: ReadableStream) => {
    controller.enqueue(encodeStart(key));
    const reader = stream.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!(value instanceof Uint8Array)) {
          throw new Error('Unexpected buffer type');
        }
        controller.enqueue(encodeChunk(key, value));
      }
      controller.enqueue(encodeEnd(key));
    } catch (err) {
      controller.enqueue(encodeError(key, err));
    }
  };

  fn(callback).then(
    () => controller.close(),
    (err) => controller.error(err),
  );

  return frameStream;
}

export async function consumeMultiplexedStream(
  frameStream: ReadableStream<Uint8Array>,
  callback: (key: string, stream: ReadableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  const controllers = new Map<
    string,
    ReadableStreamDefaultController<Uint8Array>
  >();
  const promises: Promise<void>[] = [];
  const dispatchFrame = createFrameDispatcher(
    // onStart
    (key) => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controllers.set(key, c);
        },
      });
      promises.push(callback(key, stream));
    },
    // onChunk
    (key, chunk) => {
      controllers.get(key)?.enqueue(chunk);
    },
    // onEnd
    (key) => {
      controllers.get(key)?.close();
      controllers.delete(key);
    },
    // onError
    (key, error) => {
      controllers.get(key)?.error(error);
      controllers.delete(key);
    },
  );

  const reader = frameStream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    dispatchFrame(value);
  }

  await Promise.all(promises);
}
