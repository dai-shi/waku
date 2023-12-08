export { honoMiddleware } from './lib/middleware/hono.js';
export { connectMiddleware } from './lib/middleware/connect.js';
export { createHandler as unstable_createHandler } from './lib/rsc/handler.js';

import type { build as buildOrig } from './lib/builder.js';

export async function build(...args: Parameters<typeof buildOrig>) {
  return (await import('./lib/builder.js')).build(...args);
}
