import type { ReactNode } from 'react';

import type { PathSpec } from './lib/utils/path.js';

type Elements = Record<string, ReactNode>;

export interface RenderContext<T = unknown> {
  rerender: (input: string, searchParams?: URLSearchParams) => void;
  context: T;
}

export type RenderEntries = (
  this: RenderContext,
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
    context?: unknown;
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
  loadModule: (id: string) => Promise<unknown>;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
};

export function getEnv(key: string): string | undefined {
  // HACK we may want to use a server-side context or something
  return (globalThis as any).__WAKU_PRIVATE_ENV__[key];
}
