import type { Config } from '../../config.js';
import type { EntriesPrd } from '../../server.js';
import type {
  renderRscWithWorker,
  getSsrConfigWithWorker,
} from '../renderers/dev-worker-api.js';

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

export type RscContext = Record<string, unknown>;

export type HandlerContext = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  readonly context: RscContext;
  devServer?: {
    rootDir: string;
    initialModules: ClonableModuleNode[];
    renderRscWithWorker: typeof renderRscWithWorker;
    getSsrConfigWithWorker: typeof getSsrConfigWithWorker;
    loadServerFile: (fileURL: string) => Promise<Record<string, any>>;
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
