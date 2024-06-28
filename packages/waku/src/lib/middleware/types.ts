import type { Config } from '../../config.js';
import type { EntriesDev, EntriesPrd } from '../../server.js';

export type ClonableModuleNode = { url: string; file: string };

export type HandlerReq = {
  body: ReadableStream;
  url: URL;
  method: string;
  headers: Record<string, string>;
};

export type HandlerRes = {
  body?: ReadableStream;
  headers?: Record<string, string | string[]>;
  status?: number;
};

export type HandlerContext = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  readonly context: Record<string, unknown>;
  unstable_devServer?: {
    rootDir: string;
    resolveClientEntryDev: (id: string) => string;
    loadServerFileRsc: (fileURL: string) => Promise<Record<string, any>>;
    loadServerModuleRsc: (id: string) => Promise<Record<string, any>>;
    loadEntriesDev: (config: { srcDir: string }) => Promise<EntriesDev>;
    loadServerFileMain: (fileURL: string) => Promise<Record<string, any>>;
    transformIndexHtml: (
      pathname: string,
    ) => Promise<TransformStream<any, any>>;
    willBeHandledLater: (pathname: string) => Promise<boolean>;
  };
};

export type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

export type MiddlewareOptions = {
  env?: Record<string, string>;
} & (
  | { cmd: 'dev'; config: Config }
  | { cmd: 'start'; loadEntries: () => Promise<EntriesPrd> }
);

export type Middleware = (options: MiddlewareOptions) => Handler;
