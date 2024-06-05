import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';
import type { ReactNode } from 'react';

import type { Config } from './config.js';
import type { PathSpec } from './lib/utils/path.js';
import { REQUEST_HEADERS } from './lib/middleware/headers.js';

type Elements = Record<string, ReactNode>;

export type BuildConfig = {
  pathname: string | PathSpec; // TODO drop support for string?
  isStatic?: boolean | undefined;
  entries?: {
    input: string;
    skipPrefetch?: boolean | undefined;
    isStatic?: boolean | undefined;
  }[];
  context?: Record<string, unknown>;
  customCode?: string; // optional code to inject TODO hope to remove this
  customData?: unknown; // should be serializable with JSON.stringify
}[];

export type RenderEntries = (
  input: string,
  options: {
    searchParams: URLSearchParams;
    buildConfig: BuildConfig | undefined;
  },
) => Promise<Elements | null>;

export type GetBuildConfig = (
  unstable_collectClientModules: (input: string) => Promise<string[]>,
) => Promise<BuildConfig>;

export type GetSsrConfig = (
  pathname: string,
  options: {
    searchParams: URLSearchParams;
    buildConfig?: BuildConfig | undefined;
  },
) => Promise<{
  input: string;
  searchParams?: URLSearchParams;
  body: ReactNode;
} | null>;

export function defineEntries(
  renderEntries: RenderEntries,
  getBuildConfig?: GetBuildConfig,
  getSsrConfig?: GetSsrConfig,
) {
  return { renderEntries, getBuildConfig, getSsrConfig };
}

export type EntriesDev = {
  default: ReturnType<typeof defineEntries>;
};

export type EntriesPrd = EntriesDev & {
  loadConfig: () => Promise<Config>;
  loadModule: (id: string) => Promise<unknown>;
  buildConfig?: BuildConfig;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
};

export function getEnv(key: string): string | undefined {
  // HACK we may want to use a server-side context or something
  return (globalThis as any).__WAKU_PRIVATE_ENV__[key];
}

type RenderStore<> = {
  rerender: (input: string, searchParams?: URLSearchParams) => void;
  context: Record<string, unknown>;
};

let renderStorage: AsyncLocalStorageType<RenderStore> | undefined;

// TODO top-level await doesn't work. Let's revisit after supporting "use server"
// try {
//   const { AsyncLocalStorage } = await import('node:async_hooks');
//   renderStorage = new AsyncLocalStorage();
// } catch (e) {
//   console.warn(
//     'AsyncLocalStorage is not available, rerender and getCustomContext are only available in sync.',
//   );
// }
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
 */
export const runWithRenderStore = <T>(
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

export function rerender(input: string, searchParams?: URLSearchParams) {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  renderStore.rerender(input, searchParams);
}

export function unstable_getCustomContext<
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(): CustomContext {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  return renderStore.context as CustomContext;
}

export function unstable_getHeaders(): Record<string, string> {
  return (unstable_getCustomContext()[REQUEST_HEADERS] || {}) as Record<
    string,
    string
  >;
}
