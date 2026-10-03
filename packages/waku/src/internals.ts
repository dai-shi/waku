export * as unstable_constants from './lib/constants.js';
export * as unstable_honoMiddleware from './lib/hono/middleware.js';
// TODO: After rc.3 migration, remove this alias and enforce the runtime boundary.
export {
  /** @deprecated Import `unstable_resolveConfig` from `waku/vite-plugins`. */
  resolveConfig as unstable_resolveConfig,
} from './lib/utils-build/config.js';
export {
  produceMultiplexedStream as unstable_produceMultiplexedStream,
  consumeMultiplexedStream as unstable_consumeMultiplexedStream,
} from './lib/utils-isomorphic/stream.js';
