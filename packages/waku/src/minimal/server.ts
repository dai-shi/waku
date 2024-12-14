import type { ReactNode } from 'react';

import type { PathSpec } from '../lib/utils/path.js';
import type { HandlerReq, HandlerRes } from '../lib/types.js';

type Elements = Record<string, ReactNode>;

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

type BuildConfig = {
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

export function new_defineEntries(fns: {
  unstable_handleRequest: HandleRequest;
  unstable_getBuildConfig: GetBuildConfig;
}) {
  return fns;
}
