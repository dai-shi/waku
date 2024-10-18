import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';

import type { HandlerReq, Middleware } from './types.js';

type Context = {
  readonly req: HandlerReq;
  readonly data: Record<string, unknown>;
};

let contextStorage: AsyncLocalStorageType<Context> | undefined;

try {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  contextStorage = new AsyncLocalStorage();
} catch {
  console.warn('AsyncLocalStorage is not available');
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
      data: ctx.data,
    };
    return runWithContext(context, next);
  };
};

export function getContext() {
  const context = contextStorage?.getStore() ?? currentContext;
  if (!context) {
    throw new Error(
      'Context is not available. Make sure to use the context middleware.',
    );
  }
  return context;
}
