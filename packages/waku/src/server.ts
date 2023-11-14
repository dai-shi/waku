import { AsyncLocalStorage } from 'node:async_hooks';
import type { ReactNode } from 'react';

type Elements = Record<string, ReactNode>;

export type RenderEntries = (input: string) => Promise<Elements | null>;

export type GetBuildConfig = (
  unstable_collectClientModules: (input: string) => Promise<string[]>,
) => Promise<{
  [pathStr: string]: {
    entries?: Iterable<readonly [input: string, skipPrefetch?: boolean]>;
    customCode?: string; // optional code to inject
    context?: unknown;
  };
}>;

export type GetSsrConfig = (pathStr: string) => Promise<{
  input: string;
  unstable_render: () => ReactNode;
} | null>;

export function defineEntries(
  renderEntries: RenderEntries,
  getBuildConfig?: GetBuildConfig,
  getSsrConfig?: GetSsrConfig,
) {
  return { renderEntries, getBuildConfig, getSsrConfig };
}

type Store = {
  getContext: () => unknown;
  rerender: (input: string) => void;
};

const asl = new AsyncLocalStorage<Store>();
// FIXME this is not what we want
(globalThis as any).WAKU_SERVER_ASYNC_LOCAL_STORAGE ||= asl;

export function getContext<T = unknown>() {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  const store = asl.getStore();
  if (store === undefined) {
    throw new Error('Missing runWithAsyncLocalStorage');
  }
  return store.getContext() as T;
}

export function rerender(input: string) {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  const store = asl.getStore();
  if (store === undefined) {
    throw new Error('Missing runWithAsyncLocalStorage');
  }
  return store.rerender(input);
}

// For internal use only
export function runWithAsyncLocalStorage<Result>(
  store: Store,
  fn: () => Result,
): Result {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  return asl.run(store, fn);
}
