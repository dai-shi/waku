import type { ReactNode } from 'react';

import type { Config } from '../config.js';
import type { ConfigPrd } from '../lib/config.js';
import type { PathSpec } from '../lib/utils/path.js';

type Elements = Record<string, unknown>;

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

// needs better name (it's not just config)
type BuildConfig =
  | {
      type: 'file';
      pathname: string;
      body: Promise<ReadableStream>;
    }
  | {
      type: 'htmlHead';
      pathSpec: PathSpec;
      head?: string;
    }
  | {
      type: 'defaultHtml';
      pathname: string;
      head?: string;
    };

// This API is still unstable
export type HandleBuild = (utils: {
  renderRsc: RenderRsc<{ moduleIdCallback?: (id: string) => void }>;
  renderHtml: RenderHtml<{ htmlHead?: string }>;
  rscPath2pathname: (rscPath: string) => string;
  unstable_generatePrefetchCode: (
    rscPaths: Iterable<string>,
    moduleIds: Iterable<string>,
  ) => string;
  unstable_collectClientModules: (elements: Elements) => Promise<string[]>;
}) => AsyncIterable<BuildConfig> | null;

export type EntriesDev = {
  default: {
    handleRequest: HandleRequest;
    handleBuild: HandleBuild;
  };
};

export type EntriesPrd = EntriesDev & {
  // TODO eliminate loadConfig
  loadConfig: () => Promise<Config>;
  configPrd: ConfigPrd;
  loadModule: (id: string) => Promise<unknown>;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
  loadPlatformData?: (key: string) => Promise<unknown>;
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
