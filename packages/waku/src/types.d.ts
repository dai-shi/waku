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

type ReactFormState<S, ReferenceId> = [
  S /* actual state value */,
  string /* key path */,
  ReferenceId /* Server Reference ID */,
  number /* number of bound arguments */,
];

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
  export function decodeAction<T>(
    body: FormData,
    serverManifest: ServerManifest,
  ): Promise<() => T> | null;
  export function decodeFormState<S>(
    actionResult: S,
    body: FormData,
    serverManifest: ServerManifest,
  ): Promise<ReactFormState<S, ServerReferenceId> | null>;
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
    serverConsumerManifest: ServerConsumerManifest;
    nonce?: string;
  };
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options: Options<T>,
  ): Promise<T>;
}

declare module 'react-dom/server.edge' {
  type Options = {
    identifierPrefix?: string;
    namespaceURI?: string;
    nonce?: string;
    bootstrapScriptContent?: string;
    bootstrapScripts?: Array<string | BootstrapScriptDescriptor>;
    bootstrapModules?: Array<string | BootstrapScriptDescriptor>;
    progressiveChunkSize?: number;
    signal?: AbortSignal;
    onError?: (error: unknown, errorInfo: ErrorInfo) => string | void;
    onPostpone?: (reason: string, postponeInfo: PostponeInfo) => void;
    unstable_externalRuntimeSrc?: string | BootstrapScriptDescriptor;
    importMap?: ImportMap;
    formState?: ReactFormState<any, any> | null;
    onHeaders?: (headers: Headers) => void;
    maxHeadersLength?: number;
  };

  export interface ReactDOMServerReadableStream extends ReadableStream {
    allReady: Promise<void>;
  }
  export function renderToReadableStream(
    children: ReactNode,
    options?: Options,
  ): Promise<ReactDOMServerReadableStream>;
}
