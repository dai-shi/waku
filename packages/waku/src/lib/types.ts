import type { Config } from '../config.js';
import type { new_defineEntries } from '../minimal/server.js';
import type { PathSpec } from './utils/path.js';

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

export type HandlerReq = {
  readonly body: ReadableStream | null;
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
};

export type HandlerRes = {
  body?: ReadableStream;
  headers?: Record<string, string | string[]>;
  status?: number;
};
