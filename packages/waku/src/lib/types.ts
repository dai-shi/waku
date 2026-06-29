import type { ReactNode } from 'react';
import type { Config } from '../config.js';
import type { Etags } from './utils/etags.js';

type Elements = Record<string, unknown>;

export type Unstable_RenderRsc = (
  elements: Elements,
  options?: {
    value?: unknown;
    etags?: Etags;
    unstable_clientModuleCallback?: (ids: string[]) => void;
  },
) => Promise<ReadableStream>;

export type Unstable_ParseRsc = (
  rscStream: ReadableStream,
) => Promise<Elements>;

export type Unstable_RenderHtml = (
  elementsStream: ReadableStream,
  html: ReactNode,
  options: {
    rscPath: string;
    formState?: unknown;
    status?: number;
    nonce?: string;
    unstable_extraScriptContent?: string;
  },
) => Promise<Response>;

export type Unstable_EmitFile = (
  filePath: string,
  body: ReadableStream,
) => Promise<void>;

export type Unstable_HandleRequest = (
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
      }
    | { type: 'custom' }
  ) & {
    pathname: string;
    req: Request;
    etags?: Etags;
  },
  utils: {
    renderRsc: Unstable_RenderRsc;
    parseRsc: Unstable_ParseRsc;
    renderHtml: Unstable_RenderHtml;
    loadBuildMetadata: (key: string) => Promise<string | undefined>;
  },
) => Promise<ReadableStream | Response | 'fallback' | null | undefined>;

export type Unstable_HandleBuild = (utils: {
  renderRsc: Unstable_RenderRsc;
  parseRsc: Unstable_ParseRsc;
  renderHtml: Unstable_RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
  saveBuildMetadata: (key: string, value: string) => Promise<void>;
  generateFile: (
    fileName: string,
    body: ReadableStream | string,
  ) => Promise<void>;
  generateDefaultHtml: (fileName: string) => Promise<void>;
  unstable_registerPrunableFile: (srcPath: string) => void;
}) => Promise<void>;

export type Unstable_Handlers = {
  handleRequest: Unstable_HandleRequest;
  handleBuild: Unstable_HandleBuild;
  [someOtherProperty: string]: unknown;
};

export type Unstable_ServerEntry = {
  fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
  build: (
    utils: {
      emitFile: Unstable_EmitFile;
      unstable_registerPrunableFile: (srcPath: string) => void;
    },
    ...args: any[]
  ) => Promise<void>;
  buildOptions?: Record<string, unknown>;
  buildEnhancers?: string[]; // enhancer module ids
  defaultExport?: unknown;
  [someOtherProperty: string]: unknown;
};

export type Unstable_ProcessRequest = (
  arg: Parameters<Unstable_ServerEntry['fetch']>[0],
) => Promise<Response | null>;

export type Unstable_ProcessBuild = (
  arg: Parameters<Unstable_ServerEntry['build']>[0],
) => Promise<void>;

export type Unstable_CreateServerEntryAdapter = <Options>(
  fn: (
    args: {
      handlers: Unstable_Handlers;
      processRequest: Unstable_ProcessRequest;
      processBuild: Unstable_ProcessBuild;
      setAllEnv: (newEnv: Readonly<Record<string, unknown>>) => void;
      config: Omit<Required<Config>, 'vite'>;
      isBuild: boolean;
      notFoundHtml: string;
    },
    options?: Options,
  ) => Unstable_ServerEntry,
) => (handlers: Unstable_Handlers, options?: Options) => Unstable_ServerEntry;
