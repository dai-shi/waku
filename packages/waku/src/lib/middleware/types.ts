import type { Config } from '../../config.js';

import type {
  EntriesDev,
  EntriesPrd,
  HandlerReq,
  HandlerRes,
} from '../types.js';

export type ClonableModuleNode = { url: string; file: string };

export type HandlerContext = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  /** @deprecated use `data` */
  readonly context: Record<string, unknown>;
  readonly data: Record<string, unknown>;
  unstable_devServer?: {
    rootDir: string;
    resolveClientEntry: (id: string) => string;
    loadServerModuleRsc: (idOrFileURL: string) => Promise<Record<string, any>>;
    loadEntriesDev: (config: { srcDir: string }) => Promise<EntriesDev>;
    loadServerModuleMain: (idOrFileURL: string) => Promise<Record<string, any>>;
    transformIndexHtml: (
      pathname: string,
    ) => Promise<TransformStream<any, any>>;
  };
  unstable_modules?: {
    rsdwServer: unknown;
    rdServer: unknown;
    rsdwClient: unknown;
    wakuMinimalClient: unknown;
  };
};

export type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

// This is highly experimental
export type ErrorCallback = (
  err: unknown,
  ctx: HandlerContext,
  origin: 'handler' | 'rsc' | 'html',
) => void;

export type MiddlewareOptions = {
  env: Record<string, string>;
  unstable_onError: Set<ErrorCallback>;
} & (
  | { cmd: 'dev'; config: Config }
  | { cmd: 'start'; loadEntries: () => Promise<EntriesPrd> }
);

export type Middleware = (options: MiddlewareOptions) => Handler;
