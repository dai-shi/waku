export const bytesToBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64');

export const base64ToBytes = (base64: string): Uint8Array =>
  new Uint8Array(Buffer.from(base64, 'base64'));
