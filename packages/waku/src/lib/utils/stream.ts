export const endStream = async (stream: WritableStream, message?: string) => {
  const writer = stream.getWriter();
  await writer.ready;
  if (message) {
    await writer.write(new TextEncoder().encode(message));
  }
  await writer.close();
};

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
