interface Reference {}

type ImportManifestEntry = {
  id: string;
  chunks: string[];
  name: string;
};

type ModuleLoading = null | {
  prefix: string;
  crossOrigin?: 'use-credentials' | '';
};

type ServerConsumerModuleMap = null | {
  [clientId: string]: {
    [clientExportName: string]: ImportManifestEntry;
  };
};

type ServerConsumerManifest = {
  moduleMap: ServerConsumerModuleMap;
  moduleLoading: ModuleLoading;
  serverModuleMap: null | ServerManifest;
};

type ServerManifest = {
  [id: string]: ImportManifestEntry;
};

type ClientManifest = {
  [id: string]: ImportManifestEntry;
};

declare module 'react-server-dom-webpack/server.edge' {
  interface TemporaryReferenceSet {}

  type Options = {
    debugChannel?: { readable?: ReadableStream; writable?: WritableStream };
    environmentName?: string;
    identifierPrefix?: string;
    signal?: AbortSignal;
    temporaryReferences?: TemporaryReferenceSet | undefined;
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
    webpackMap: ServerManifest,
    options?: { temporaryReferences?: TemporaryReferenceSet },
  ): Promise<T>;
  export function decodeAction<T>(
    body: FormData,
    serverManifest: ServerManifest,
  ): Promise<() => T> | null;
  export function decodeFormState<S>(
    actionResult: S,
    body: FormData,
    serverManifest: ServerManifest,
  ): Promise<ReactFormState | null>;
  export function createTemporaryReferenceSet(): TemporaryReferenceSet;
}

declare module 'react-server-dom-webpack/client' {
  type TemporaryReferenceSet = Map<string, Reference | symbol>;

  type CallServerCallback = <T, A extends unknown[] = unknown[]>(
    string,
    args: A,
  ) => Promise<T>;

  type Options<T> = {
    callServer?: CallServerCallback<T>;
    debugChannel?:
      { writable?: WritableStream; readable?: ReadableStream } | undefined;
    findSourceMapURL?: (filename: string, environmentName: string) => string;
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
  export function createTemporaryReferenceSet(): TemporaryReferenceSet;
}

declare module 'react-server-dom-webpack/client.edge' {
  export type Options = {
    serverConsumerManifest: ServerConsumerManifest;
    nonce?: string;
  };
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options?: Options,
  ): Promise<T>;
}
