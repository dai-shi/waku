import type { createElement, ReactNode } from 'react';

import type { Slot } from './client.js';

type Elements = Record<string, ReactNode>;

export interface RenderContext<T = unknown> {
  rerender: (name: string) => void;
  context: T;
}

export type RenderEntries = (
  this: RenderContext,
  input: string,
) => Promise<Elements | null>;

export type GetBuildConfig = (
  unstable_collectClientModules: (input: string) => Promise<string[]>,
) => Promise<
  Iterable<{
    pathname: string;
    search?: string | undefined;
    entries?: Iterable<readonly [input: string, skipPrefetch?: boolean]>;
    customCode?: string; // optional code to inject TODO hope to remove this
    context?: unknown;
  }>
>;

export type GetSsrConfig = (reqUrl: URL) => Promise<{
  input: string;
  unstable_render: (opts: {
    createElement: typeof createElement;
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
  loadHtmlHead: (pathname: string, search: string) => string;
};
