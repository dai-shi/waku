interface Reference {}

type TemporaryReferenceSet = Map<string, Reference | symbol>;

type ImportManifestEntry = {
  id: string;
  chunks: string[];
  name: string;
};

type ModuleLoading = null | {
  prefix: string;
  crossOrigin?: 'use-credentials' | '';
};

type SSRModuleMap = null | {
  [clientId: string]: {
    [clientExportName: string]: ImportManifestEntry;
  };
};

type SSRManifest = {
  moduleMap: SSRModuleMap;
  moduleLoading: ModuleLoading;
};

type ServerManifest = {
  [id: string]: ImportManifestEntry;
};

type ClientManifest = {
  [id: string]: ImportManifestEntry;
};

declare module 'react-server-dom-webpack/server.edge' {
  type Options = {
    environmentName?: string;
    identifierPrefix?: string;
    signal?: AbortSignal;
    temporaryReferences?: TemporaryReferenceSet;
    onError?: ((error: unknown) => void) | undefined;
    onPostpone?: ((reason: string) => void) | undefined;
  };

  export function renderToReadableStream(
    model: ReactClientValue,
    webpackMap: ClientManifest,
    options?: Options,
  ): ReadableStream;
  export function decodeReply<T>(
    body: string | FormData,
    webpackMap?: ServerManifest,
  ): Promise<T>;
}

declare module 'react-server-dom-webpack/client' {
  type CallServerCallback = <T, A extends unknown[] = unknown[]>(
    string,
    args: A,
  ) => Promise<T>;

  type Options<T> = {
    callServer?: CallServerCallback<T>;
    temporaryReferences?: TemporaryReferenceSet;
  };

  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: Options<T>,
  ): Promise<T>;
  export function encodeReply(
    value: ReactServerValue,
    options?: { temporaryReferences?: TemporaryReferenceSet },
  ): Promise<string | URLSearchParams | FormData>;
}

declare module 'react-server-dom-webpack/client.edge' {
  export type Options = {
    ssrManifest: SSRManifest;
    nonce?: string;
  };
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options: Options<T>,
  ): Promise<T>;
}

declare module 'react-dom/server.edge' {
  export interface ReactDOMServerReadableStream extends ReadableStream {
    allReady: Promise<void>;
  }
  export function renderToReadableStream(
    children: ReactNode,
    options?: Options,
  ): Promise<ReactDOMServerReadableStream>;
}
