import type { ReactNode } from 'react';

import type { Config } from '../config.js';
import type { PureConfig } from '../lib/config.js';
import type { PathSpec } from '../lib/utils/path.js';
// TODO move types somewhere
import type { HandlerReq, HandlerRes } from '../lib/middleware/types.js';

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

// -----------------------------------------------------
// new_defineEntries
// Eventually replaces defineEntries
// -----------------------------------------------------

type HandleRequest = (
  config: PureConfig,
  req: HandlerReq,
  utils: {
    renderRsc: (elements: Elements) => ReadableStream;
    decodeRscPath: (rscPath: string) => string;
  },
) => Promise<ReadableStream | HandlerRes | null | undefined>;

export function new_defineEntries(fns: {
  unstable_handleRequest: HandleRequest;
  unstable_getBuildConfig: GetBuildConfig;
}) {
  return fns;
}
