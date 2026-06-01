import { createFromReadableStream } from 'react-server-dom-webpack/client.edge';
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { getContext } from './lib/context.js';
import { bytesToStream, streamToBytes } from './lib/utils/stream.js';

export {
  getContext as unstable_getContext,
  getContextData as unstable_getContextData,
} from './lib/context.js';

export { getEnv } from './lib/env.js';

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return Object.fromEntries(getContext().req.headers.entries());
}

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(renderToReadableStream(element, {}));
}

export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  return createFromReadableStream(bytesToStream(bytes));
}
