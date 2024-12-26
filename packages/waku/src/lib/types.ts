import type { ReactNode } from 'react';

import type { Config } from '../config.js';
import type { PathSpec } from '../lib/utils/path.js';

type Elements = Record<string, ReactNode>;

type RenderRsc = (elements: Record<string, unknown>) => Promise<ReadableStream>;
type RenderHtml<Opts = unknown> = (
  elements: Elements,
  html: ReactNode,
  options: { rscPath: string; actionResult?: unknown } & Opts,
) => Promise<{
  body: ReadableStream & { allReady: Promise<void> };
  headers: Record<'content-type', string>;
}>;

// This API is still unstable
export type HandleRequest = (
  input: (
    | { type: 'component'; rscPath: string; rscParams: unknown }
    | {
        type: 'function';
        fn: (...args: unknown[]) => Promise<unknown>;
        args: unknown[];
      }
    | {
        type: 'action';
        fn: () => Promise<unknown>;
        pathname: string;
      }
    | { type: 'custom'; pathname: string }
  ) & {
    req: HandlerReq;
  },
  utils: {
    renderRsc: RenderRsc;
    renderHtml: RenderHtml;
  },
) => Promise<ReadableStream | HandlerRes | null | undefined>;

// This API is still unstable
export type BuildConfig = {
  pathSpec: PathSpec;
  isStatic?: boolean | undefined;
  entries?: {
    rscPath: string;
    skipPrefetch?: boolean | undefined;
    isStatic?: boolean | undefined;
  }[];
  customCode?: string; // optional code to inject TODO hope to remove this
}[];

type GetBuildConfig = (utils: {
  unstable_collectClientModules: (elements: Elements) => Promise<string[]>;
}) => Promise<BuildConfig>;

export type EntriesDev = {
  default: {
    handleRequest: HandleRequest;
    getBuildConfig: GetBuildConfig;
  };
};

export type EntriesPrd = EntriesDev & {
  loadConfig: () => Promise<Config>;
  loadModule: (id: string) => Promise<unknown>;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
  buildData?: Record<string, unknown>; // must be JSON serializable
};

export type HandlerReq = {
  body: ReadableStream | null;
  url: URL;
  method: string;
  headers: Readonly<Record<string, string>>;
};

export type HandlerRes = {
  body?: ReadableStream;
  headers?: Record<string, string | string[]>;
  status?: number;
};
