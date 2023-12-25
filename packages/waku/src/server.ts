import type { createElement, Fragment, ReactNode } from 'react';

import type { Slot } from './client.js';

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
    pathname: string;
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
    isPrd: boolean;
  },
) => Promise<{
  input: string;
  searchParams?: URLSearchParams;
  unstable_render: (opts: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
    Slot: typeof Slot;
  }) => ReactNode;
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
  loadHtmlHead: (pathname: string) => string;
  skipRenderRsc: (input: string) => boolean;
};
