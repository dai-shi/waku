import type { Config } from '../../config.js';
import type { EntriesPrd } from '../../server.js';

export type HandlerReq = {
  readonly body: ReadableStream;
  readonly url: URL;
  readonly method: string;
  readonly headers: Record<string, string>;
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
