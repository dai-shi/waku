type ReactServerValue = any; // any serializable value

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

declare module 'react-server-dom-webpack/node-loader';
declare module 'react-server-dom-webpack/server.node.unbundled'; // TODO

declare module 'react-server-dom-webpack/client' {
  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: Options,
  ): Promise<T>;
  export function encodeReply(
    value: ReactServerValue,
  ): Promise<string | URLSearchParams | FormData>;
}

declare module 'react-server-dom-webpack/client.edge' {
  export type Options = {
    ssrManifest: SSRManifest;
    nonce?: string;
  };
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options: Options,
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
