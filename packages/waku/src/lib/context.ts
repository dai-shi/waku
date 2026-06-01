import { AsyncLocalStorage } from 'node:async_hooks';

type Context = {
  readonly req: Request;
  nonce: string | undefined;
  readonly data: Record<string, unknown>;
};

const contextStorage = new AsyncLocalStorage<Context>();

/**
 * This is an internal function and not for public use.
 */
export function runWithContext<T>(req: Request, next: () => T): T {
  const context: Context = {
    req,
    nonce: undefined,
    data: {},
  };
  return contextStorage.run(context, next);
}

export function getContext() {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('Context is not available.');
  }
  return context;
}

export function getContextData(): Record<string, unknown> {
  const context = contextStorage.getStore();
  if (!context) {
    return {};
  }
  return context.data;
}
