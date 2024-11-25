/// <reference types="react/canary" />
'use client';

import {
  Component,
  createContext,
  createElement,
  memo,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import RSDWClient from 'react-server-dom-webpack/client';

import { encodeRscPath, encodeFuncId } from '../lib/renderers/utils.js';

const { createFromFetch, encodeReply } = RSDWClient;

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const BASE_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE
}/`;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const err = new Error(response.statusText);
    (err as any).statusCode = response.status;
    throw err;
  }
  return response;
};

type Elements = Promise<Record<string, ReactNode>> & {
  prev?: Record<string, ReactNode> | undefined;
};

const getCached = <T>(c: () => T, m: WeakMap<object, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;
const cache1 = new WeakMap();
const mergeElements = (a: Elements, b: Elements): Elements => {
  const getResult = () => {
    const promise: Elements = new Promise((resolve, reject) => {
      Promise.all([a, b])
        .then(([a, b]) => {
          const nextElements = { ...a, ...b };
          delete nextElements._value;
          promise.prev = a;
          resolve(nextElements);
        })
        .catch((e) => {
          a.then(
            (a) => {
              promise.prev = a;
              reject(e);
            },
            () => {
              promise.prev = a.prev;
              reject(e);
            },
          );
        });
    });
    return promise;
  };
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type SetElements = (updater: (prev: Elements) => Elements) => void;
type EnhanceCreateData = (
  createData: (
    responsePromise: Promise<Response>,
  ) => Promise<Record<string, ReactNode>>,
) => (responsePromise: Promise<Response>) => Promise<Record<string, ReactNode>>;

const ENTRY = 'e';
const SET_ELEMENTS = 's';
const ENHANCE_CREATE_DATA = 'd';

type FetchCache = {
  [ENTRY]?: [rscPath: string, rscParams: unknown, elements: Elements];
  [SET_ELEMENTS]?: SetElements;
  [ENHANCE_CREATE_DATA]?: EnhanceCreateData | undefined;
};

const defaultFetchCache: FetchCache = {};

/**
 * callServer callback
 * This is not a public API.
 */
export const callServerRsc = async (
  funcId: string,
  args: unknown[],
  fetchCache = defaultFetchCache,
) => {
  const enhanceCreateData = fetchCache[ENHANCE_CREATE_DATA] || ((d) => d);
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Awaited<Elements>>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        callServerRsc(funcId, args, fetchCache),
    });
  const url = BASE_PATH + encodeRscPath(encodeFuncId(funcId));
  const responsePromise =
    args.length === 1 && args[0] instanceof URLSearchParams
      ? fetch(url + '?' + args[0])
      : encodeReply(args).then((body) => fetch(url, { method: 'POST', body }));
  const data = enhanceCreateData(createData)(responsePromise);
  // FIXME this causes rerenders even if data is empty
  fetchCache[SET_ELEMENTS]?.((prev) => mergeElements(prev, data));
  return (await data)._value;
};

const prefetchedParams = new WeakMap<Promise<unknown>, unknown>();

const fetchRscInternal = (url: string, rscParams: unknown) =>
  rscParams === undefined
    ? fetch(url)
    : rscParams instanceof URLSearchParams
      ? fetch(url + '?' + rscParams)
      : encodeReply(rscParams).then((body) =>
          fetch(url, { method: 'POST', body }),
        );

export const fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  fetchCache = defaultFetchCache,
): Elements => {
  const entry = fetchCache[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const enhanceCreateData = fetchCache[ENHANCE_CREATE_DATA] || ((d) => d);
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Awaited<Elements>>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        callServerRsc(funcId, args, fetchCache),
    });
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url = BASE_PATH + encodeRscPath(rscPath);
  const hasValidPrefetchedResponse =
    !!prefetched[url] &&
    // HACK .has() is for the initial hydration
    // It's limited and may result in a wrong result. FIXME
    (!prefetchedParams.has(prefetched[url]) ||
      prefetchedParams.get(prefetched[url]) === rscParams);
  const responsePromise = hasValidPrefetchedResponse
    ? prefetched[url]
    : fetchRscInternal(url, rscParams);
  delete prefetched[url];
  const data = enhanceCreateData(createData)(responsePromise);
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fetchCache[ENTRY] = [rscPath, rscParams, data];
  return data;
};

export const prefetchRsc = (rscPath: string, rscParams?: unknown): void => {
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url = BASE_PATH + encodeRscPath(rscPath);
  if (!(url in prefetched)) {
    prefetched[url] = fetchRscInternal(url, rscParams);
    prefetchedParams.set(prefetched[url], rscParams);
  }
};

const RefetchContext = createContext<
  (rscPath: string, rscParams?: unknown) => void
>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Elements | null>(null);

export const Root = ({
  initialRscPath,
  initialRscParams,
  fetchCache = defaultFetchCache,
  unstable_enhanceCreateData,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  fetchCache?: FetchCache;
  unstable_enhanceCreateData?: EnhanceCreateData;
  children: ReactNode;
}) => {
  fetchCache[ENHANCE_CREATE_DATA] = unstable_enhanceCreateData;
  const [elements, setElements] = useState(() =>
    fetchRsc(initialRscPath || '', initialRscParams, fetchCache),
  );
  useEffect(() => {
    fetchCache[SET_ELEMENTS] = setElements;
  }, [fetchCache, setElements]);
  const refetch = useCallback(
    (rscPath: string, rscParams?: unknown) => {
      // clear cache entry before fetching
      delete fetchCache[ENTRY];
      const data = fetchRsc(rscPath, rscParams, fetchCache);
      setElements((prev) => mergeElements(prev, data));
    },
    [fetchCache],
  );
  return createElement(
    RefetchContext.Provider,
    { value: refetch },
    createElement(ElementsContext.Provider, { value: elements }, children),
  );
};

export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext.Provider);

type OuterSlotProps = {
  elementsPromise: Elements;
  unstable_shouldRenderPrev:
    | ((err: unknown, prevElements: Record<string, ReactNode>) => boolean)
    | undefined;
  renderSlot: (elements: Record<string, ReactNode>, err?: unknown) => ReactNode;
  children?: ReactNode;
};

class OuterSlot extends Component<OuterSlotProps, { error?: unknown }> {
  constructor(props: OuterSlotProps) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      const e = this.state.error;
      if (e instanceof Error && !('statusCode' in e)) {
        // HACK we assume any error as Not Found,
        // probably caused by history api fallback
        (e as any).statusCode = 404;
      }
      const prevElements = this.props.elementsPromise.prev;
      if (
        prevElements &&
        this.props.unstable_shouldRenderPrev?.(e, prevElements)
      ) {
        return this.props.renderSlot(prevElements, e);
      } else {
        throw e;
      }
    }
    return this.props.children;
  }
}

const InnerSlot = ({
  elementsPromise,
  renderSlot,
}: {
  elementsPromise: Elements;
  renderSlot: (elements: Record<string, ReactNode>, err?: unknown) => ReactNode;
}) => {
  const elements = use(elementsPromise);
  return renderSlot(elements);
};

const ErrorContext = createContext<unknown>(undefined);
export const ThrowError_UNSTABLE = () => {
  const err = use(ErrorContext);
  throw err;
};

/**
 * Slot component
 * This is used under the Root component.
 * Slot id is the key of elements returned by the server.
 *
 * If the server returns this
 * ```
 *   { 'foo': <div>foo</div>, 'bar': <div>bar</div> }
 * ```
 * then you can use this component like this
 * ```
 *   <Root><Slot id="foo" /><Slot id="bar" /></Root>
 * ```
 */
export const Slot = ({
  id,
  children,
  fallback,
  unstable_shouldRenderPrev,
  unstable_renderPrev,
}: {
  id: string;
  children?: ReactNode;
  fallback?: ReactNode;
  unstable_shouldRenderPrev?: (
    err: unknown,
    prevElements: Record<string, ReactNode>,
  ) => boolean;
  unstable_renderPrev?: boolean;
}) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  const renderSlot = (elements: Record<string, ReactNode>, err?: unknown) => {
    if (!(id in elements)) {
      if (fallback) {
        if (err) {
          // HACK I'm not sure if this is the right way
          return createElement(ErrorContext.Provider, { value: err }, fallback);
        }
        return fallback;
      }
      throw new Error('Not found: ' + id);
    }
    return createElement(
      ChildrenContextProvider,
      { value: children },
      elements[id],
    );
  };
  if (unstable_renderPrev) {
    if (!elementsPromise.prev) {
      throw new Error('Missing prev elements');
    }
    return renderSlot(elementsPromise.prev);
  }
  return createElement(
    OuterSlot,
    {
      elementsPromise,
      unstable_shouldRenderPrev,
      renderSlot,
    },
    createElement(InnerSlot, { elementsPromise, renderSlot }),
  );
};

export const Children = () => use(ChildrenContext);

/**
 * ServerRoot for SSR
 * This is not a public API.
 */
export const ServerRootInternal = ({
  elements,
  children,
}: {
  elements: Elements;
  children: ReactNode;
}) => createElement(ElementsContext.Provider, { value: elements }, children);
