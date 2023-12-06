export { honoWrapper } from './lib/middleware/honoWrapper.js';
export { connectWrapper } from './lib/middleware/connectWrapper.js';
export { rsc } from './lib/middleware/rsc.js';

import type { build as buildOrig } from './lib/builder.js';

export async function build(...args: Parameters<typeof buildOrig>) {
  return (await import('./lib/builder.js')).build(...args);
}
