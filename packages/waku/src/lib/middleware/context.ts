import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';

import type { HandlerReq, HandlerRes, Middleware } from './types.js';

type Context = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  readonly data: Record<string, unknown>;
};

let contextStorage: AsyncLocalStorageType<Context> | undefined;

try {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  contextStorage = new AsyncLocalStorage();
} catch {
  console.warn(
    'AsyncLocalStorage is not available, rerender and getCustomContext are only available in sync.',
  );
}

let previousContext: Context | undefined;
let currentContext: Context | undefined;

const runWithContext = <T>(context: Context, fn: () => T): T => {
  if (contextStorage) {
    return contextStorage.run(context, fn);
  }
  previousContext = currentContext;
  currentContext = context;
  try {
    return fn();
  } finally {
    currentContext = previousContext;
  }
};

export const context: Middleware = () => {
  return async (ctx, next) => {
    const context: Context = {
      req: ctx.req,
      res: ctx.res,
      data: ctx.data,
    };
    return runWithContext(context, next);
  };
};

export function getContext() {
  const context = contextStorage?.getStore() ?? currentContext;
  if (!context) {
    throw new Error('Context is not available');
  }
  return context;
}
