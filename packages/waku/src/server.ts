import { cache } from 'react';
import type { ReactNode } from 'react';

import type { Config } from './config.js';
import type { PathSpec } from './lib/utils/path.js';

type Elements = Record<string, ReactNode>;

export type RenderEntries = (
  input: string,
  searchParams: URLSearchParams,
) => Promise<Elements | null>;

export type GetBuildConfig = (
  unstable_collectClientModules: (input: string) => Promise<string[]>,
) => Promise<
  Iterable<{
    pathname: string | PathSpec; // TODO drop support for string?
    isStatic?: boolean;
    entries?: Iterable<{
      input: string;
      skipPrefetch?: boolean;
      isStatic?: boolean;
    }>;
    customCode?: string; // optional code to inject TODO hope to remove this
    context?: Record<string, unknown>;
  }>
>;

export type GetSsrConfig = (
  pathname: string,
  options: {
    searchParams: URLSearchParams;
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
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
};

export function getEnv(key: string): string | undefined {
  // HACK we may want to use a server-side context or something
  return (globalThis as any).__WAKU_PRIVATE_ENV__[key];
}

type RenderContext<
  RscContext extends Record<string, unknown> = Record<string, unknown>,
> = {
  rerender: (input: string, searchParams?: URLSearchParams) => void;
  context: RscContext;
};

const getRenderContextHolder = cache(() => [] as [RenderContext?]);

/**
 * This is an internal function and not for public use.
 */
export const setRenderContext = (renderContext: RenderContext) => {
  const holder = getRenderContextHolder();
  holder[0] = renderContext;
};

export function rerender(input: string, searchParams?: URLSearchParams) {
  const holder = getRenderContextHolder();
  if (!holder[0]) {
    throw new Error('[Bug] No render context found');
  }
  holder[0].rerender(input, searchParams);
}

export function getContext<
  RscContext extends Record<string, unknown> = Record<string, unknown>,
>(): RscContext {
  const holder = getRenderContextHolder();
  if (!holder[0]) {
    throw new Error('[Bug] No render context found');
  }
  return holder[0].context as RscContext;
}
