import type { ReactNode } from 'react';

import type { Config } from '../config.js';
import type { PathSpec } from '../lib/utils/path.js';

type Elements = Record<string, ReactNode>;

type RenderRsc<Opts = unknown> = (
  elements: Record<string, unknown>,
  options?: Opts,
) => Promise<ReadableStream>;

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
export type HandleBuild = (utils: {
  renderRsc: RenderRsc<{ moduleIdCallback?: () => string }>;
  renderHtml: RenderHtml<{ htmlHead: string }>;
  unstable_collectClientModules: (elements: Elements) => Promise<string[]>;
}) => AsyncIterable<
  | {
      type: 'file';
      pathname: string;
      body: ReadableStream;
    }
  | {
      type: 'htmlHead';
      pathSpec: PathSpec;
      head: string;
    }
  | {
      type: 'indexHtml';
    },
  void,
  undefined
>;

export type EntriesDev = {
  default: {
    handleRequest: HandleRequest;
    handleBuild: HandleBuild;
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
