// Utility functions for web streams (not Node.js streams)

export const concatUint8Arrays = (arrs: Uint8Array[]): Uint8Array => {
  const len = arrs.reduce((acc, arr) => acc + arr.length, 0);
  const array = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrs) {
    array.set(arr, offset);
    offset += arr.length;
  }
  return array;
};

// FIXME remove the two loops if possible, if it is more efficient
export const streamToArrayBuffer = async (stream: ReadableStream) => {
  const reader = stream.getReader();
  const chunks = [];
  let totalSize = 0;
  let done = false;
  let value: Uint8Array | undefined;

  do {
    ({ done, value } = await reader.read());
    if (!done && value) {
      chunks.push(value);
      totalSize += value.length;
    }
  } while (!done);

  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
};

export const streamToString = async (
  stream: ReadableStream,
): Promise<string> => {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const outs: string[] = [];
  let result: ReadableStreamReadResult<unknown>;
  do {
    result = await reader.read();
    if (result.value) {
      if (!(result.value instanceof Uint8Array)) {
        throw new Error('Unexepected buffer type');
      }
      outs.push(decoder.decode(result.value, { stream: true }));
    }
  } while (!result.done);
  outs.push(decoder.decode());
  return outs.join('');
};

export const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};
