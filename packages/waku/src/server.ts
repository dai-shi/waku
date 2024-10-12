import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks';
import type { ReactNode } from 'react';

import type { Config } from './config.js';
import type { PureConfig } from './lib/config.js';
import type { PathSpec } from './lib/utils/path.js';
import { getContext } from './lib/middleware/context.js';
// TODO move types somewhere
import type { HandlerContext } from './lib/middleware/types.js';

export { renderRsc as unstable_renderRsc } from './lib/renderers/rsc.js';

type Elements = Record<string, ReactNode>;

export type BuildConfig = {
  pathname: string | PathSpec; // TODO drop support for string?
  isStatic?: boolean | undefined;
  entries?: {
    rscPath: string;
    skipPrefetch?: boolean | undefined;
    isStatic?: boolean | undefined;
  }[];
  context?: Record<string, unknown>;
  customCode?: string; // optional code to inject TODO hope to remove this
}[];

export type RenderEntries = (
  rscPath: string,
  options: {
    rscParams: unknown | undefined;
  },
) => Promise<Elements | null>;

export type GetBuildConfig = (
  unstable_collectClientModules: (rscPath: string) => Promise<string[]>,
) => Promise<BuildConfig>;

export type GetSsrConfig = (
  pathname: string,
  options: {
    searchParams: URLSearchParams;
  },
) => Promise<{
  rscPath: string;
  rscParams?: unknown;
  html: ReactNode;
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
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
  buildData?: Record<string, unknown>; // must be JSON serializable
};

/**
 * This is an internal function and not for public use.
 */
export function setAllEnvInternal(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}

type RenderStore<> = {
  rerender: (rscPath: string, rscParams?: unknown) => void;
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

export function rerender(rscPath: string, rscParams?: unknown) {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  renderStore.rerender(rscPath, rscParams);
}

/** @deprecated use getContext from context middleware */
export function unstable_getCustomContext<
  CustomContext extends Record<string, unknown> = Record<string, unknown>,
>(): CustomContext {
  const renderStore = renderStorage?.getStore() ?? currentRenderStore;
  if (!renderStore) {
    throw new Error('Render store is not available');
  }
  return renderStore.context as CustomContext;
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

// -----------------------------------------------------
// new_defineEntries
// Eventually replaces defineEntries
// -----------------------------------------------------

type HandleRequest = (config: PureConfig, ctx: HandlerContext) => Promise<void>;

export function new_defineEntries(fns: {
  unstable_handleRequest: HandleRequest;
  unstable_getBuildConfig: GetBuildConfig;
}) {
  return fns;
}
