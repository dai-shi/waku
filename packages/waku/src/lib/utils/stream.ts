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
