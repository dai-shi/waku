import type { Config } from '../../config.js';
import type { EntriesPrd } from '../../server.js';
import type {
  renderRscWithWorker,
  getSsrConfigWithWorker,
} from '../renderers/dev-worker-api.js';

export type HandlerReq = {
  body: ReadableStream;
  url: URL;
  method: string;
  headers: Record<string, string>;
};

export type HandlerRes = {
  body?: ReadableStream;
  headers?: Record<string, string>;
  status?: number;
};

export type RscContext = Record<string, unknown>;

export type HandlerContext = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  readonly context: RscContext;
  devServer?: {
    rootDir: string;
    renderRscWithWorker: typeof renderRscWithWorker;
    getSsrConfigWithWorker: typeof getSsrConfigWithWorker;
    loadServerFile: (fileURL: string) => Promise<Record<string, any>>;
    transformIndexHtml: (
      pathname: string,
    ) => Promise<TransformStream<any, any>>;
  };
};

export type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

export type MiddlewareOptions = {
  config?: Config;
  env?: Record<string, string>;
} & ({ cmd: 'dev' } | { cmd: 'start'; loadEntries: () => Promise<EntriesPrd> });

export type Middleware = (options: MiddlewareOptions) => Handler;
