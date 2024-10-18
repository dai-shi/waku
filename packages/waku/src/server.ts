import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';

// This can't be relative import
import { getContext } from 'waku/middleware/context';

import { defineEntries as defineEntriesOrig } from './minimal/server.js';
/** @deprecated */
export const defineEntries = defineEntriesOrig;

/**
 * This is an internal function and not for public use.
 */
export function setAllEnvInternal(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return getContext().req.headers;
}

type PlatformObject = {
  buildData?: Record<string, unknown>; // must be JSON serializable
  buildOptions?: {
    deploy?:
      | 'vercel-static'
      | 'vercel-serverless'
      | 'netlify-static'
      | 'netlify-functions'
      | 'cloudflare'
      | 'partykit'
      | 'deno'
      | 'aws-lambda'
      | undefined;
    unstable_phase?:
      | 'analyzeEntries'
      | 'buildServerBundle'
      | 'buildSsrBundle'
      | 'buildClientBundle'
      | 'buildDeploy';
  };
} & Record<string, unknown>;

(globalThis as any).__WAKU_PLATFORM_OBJECT__ ||= {};

// TODO tentative name
export function unstable_getPlatformObject(): PlatformObject {
  return (globalThis as any).__WAKU_PLATFORM_OBJECT__;
}

type RenderStore<> = {
  rerender: (rscPath: string, rscParams?: unknown) => void;
  context: Record<string, unknown>;
};

let renderStorage: AsyncLocalStorageType<RenderStore> | undefined;

import('node:async_hooks')
  .then(({ AsyncLocalStorage }) => {
    renderStorage = new AsyncLocalStorage();
  })
  .catch(() => {
    console.warn(
      'AsyncLocalStorage is not available, rerender and getCustomContext are only available in sync.',
    );
  });

let previousRenderStore: RenderStore | undefined;
let currentRenderStore: RenderStore | undefined;

/**
 * This is an internal function and not for public use.
 * @deprecated
 */
export const runWithRenderStoreInternal = <T>(
  renderStore: RenderStore,
  fn: () => T,
): T => {
  if (renderStorage) {
    return renderStorage.run(renderStore, fn);
  }
  previousRenderStore = currentRenderStore;
  currentRenderStore = renderStore;
  try {
    return fn();
  } finally {
    currentRenderStore = previousRenderStore;
  }
};

/** @deprecated use new_defineEntries */
export function rerender(rscPath: string, rscParams?: unknown) {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  renderStore.rerender(rscPath, rscParams);
}

/** @deprecated use getContext from waku/middleware/context */
export function unstable_getCustomContext<
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(): CustomContext {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  return renderStore.context as CustomContext;
}
