declare global {
  var __WAKU_RSC_RELOAD_LISTENERS__: (() => void)[] | undefined;
  var __WAKU_REFETCH_RSC__: (() => void) | undefined;
  var __WAKU_REFETCH_ROUTE__: (() => void) | undefined;
  var __WAKU_START_PREVIEW_SERVER__:
    (() => Promise<import('./vite-rsc/preview.js').PreviewServer>) | undefined;
  var __WAKU_SERVER_ENV__: Readonly<Record<string, string>> | undefined;
  var __WAKU_PREFETCHED__:
    | import('../minimal/client-utils/prefetch-cache.js').PrefetchEntry[]
    | undefined;
  var __WAKU_INITIAL_RSC__:
    import('./utils/initial-rsc.js').InitialRscEntry | undefined;
  var __WAKU_DEBUG_CHANNELS__:
    | Map<string, { readable: ReadableStream; writable: WritableStream }>
    | undefined;
  var __WAKU_ROUTER_PREFETCH__:
    ((path: string, callback: (id: string) => void) => void) | undefined;
  var __WAKU_HONO_NODE_SERVER_GET_REQUEST_LISTENER__:
    (typeof import('@hono/node-server'))['getRequestListener'] | undefined;
  var __WAKU_DENO_ADAPTER_HONO__:
    (typeof import('hono/tiny'))['Hono'] | undefined;
  var __WAKU_DENO_ADAPTER_SERVE_STATIC__:
    | ((options: { root: string }) => import('hono').MiddlewareHandler)
    | undefined;
  var __WAKU_AWS_LAMBDA_HANDLE__:
    | (typeof import('hono/aws-lambda'))['handle']
    | (typeof import('hono/aws-lambda'))['streamHandle']
    | undefined;
}
