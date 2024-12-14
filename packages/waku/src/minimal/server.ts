import type { ReactNode } from 'react';

import type { Config } from '../config.js';
import type { PathSpec } from '../lib/utils/path.js';
// TODO move types somewhere
import type { HandlerReq, HandlerRes } from '../lib/middleware/types.js';

type Elements = Record<string, ReactNode>;

// -----------------------------------------------------
// new_defineEntries
// Eventually replaces defineEntries
// -----------------------------------------------------

type HandleRequest = (
  input: (
    | { type: 'component'; rscPath: string; rscParams: unknown }
    | {
        type: 'function';
        fn: (...args: unknown[]) => Promise<unknown>;
        args: unknown[];
      }
    | { type: 'custom'; pathname: string }
  ) & {
    req: HandlerReq;
  },
  utils: {
    renderRsc: (elements: Record<string, unknown>) => ReadableStream;
    renderHtml: (
      elements: Elements,
      html: ReactNode,
      rscPath: string,
    ) => {
      body: ReadableStream;
      headers: Record<'content-type', string>;
    };
  },
) => Promise<ReadableStream | HandlerRes | null | undefined>;

export type new_BuildConfig = {
  pathSpec: PathSpec;
  isStatic?: boolean | undefined;
  entries?: {
    rscPath: string;
    skipPrefetch?: boolean | undefined;
    isStatic?: boolean | undefined;
  }[];
  customCode?: string; // optional code to inject TODO hope to remove this
}[];

type new_GetBuildConfig = (utils: {
  unstable_collectClientModules: (elements: Elements) => Promise<string[]>;
}) => Promise<new_BuildConfig>;

export function new_defineEntries(fns: {
  unstable_handleRequest: HandleRequest;
  unstable_getBuildConfig: new_GetBuildConfig;
}) {
  return fns;
}

export type EntriesDev = {
  default: ReturnType<typeof new_defineEntries>;
};

export type EntriesPrd = EntriesDev & {
  loadConfig: () => Promise<Config>;
  loadModule: (id: string) => Promise<unknown>;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
  buildData?: Record<string, unknown>; // must be JSON serializable
};
