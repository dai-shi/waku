import type { Middleware } from './types.js';

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const DO_NOT_BUNDLE = '';

export const devServer: Middleware = (options) => {
  if (import.meta.env && import.meta.env.MODE === 'production') {
    // pass through
    return (_ctx, next) => next();
  }
  const devServerImplPromise = import(
    DO_NOT_BUNDLE + './dev-server-impl.js'
  ).then(({ devServer }) => devServer(options));
  return async (ctx, next) => {
    const devServerImpl = await devServerImplPromise;
    return devServerImpl(ctx, next);
  };
};
