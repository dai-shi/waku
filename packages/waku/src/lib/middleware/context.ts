import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';

import type { HandlerReq } from '../types.js';
import type { Middleware } from './types.js';

type Context = {
  readonly req: HandlerReq;
  readonly data: Record<string, unknown>;
};

const setContextStorage = (storage: AsyncLocalStorageType<Context>) => {
  (globalThis as any).__WAKU_MIDDLEWARE_CONTEXT_STORAGE__ ||= storage;
};

const getContextStorage = (): AsyncLocalStorageType<Context> => {
  return (globalThis as any).__WAKU_MIDDLEWARE_CONTEXT_STORAGE__;
};

try {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  setContextStorage(new AsyncLocalStorage());
} catch {
  console.warn('AsyncLocalStorage is not available');
}

let previousContext: Context | undefined;
let currentContext: Context | undefined;

const runWithContext = <T>(context: Context, fn: () => T): T => {
  const contextStorage = getContextStorage();
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
  const contextStorage = getContextStorage();
  const context = contextStorage?.getStore() ?? currentContext;
  if (!context) {
    throw new Error(
      'Context is not available. Make sure to use the context middleware. For now, Context is not available during the build time.',
    );
  }
  return context;
}

export function getContextData(): Record<string, unknown> {
  const contextStorage = getContextStorage();
  const context = contextStorage?.getStore() ?? currentContext;
  if (!context) {
    return {};
  }
  return context.data;
}
