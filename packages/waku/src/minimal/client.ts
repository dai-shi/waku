/// <reference types="react/canary" />
'use client';

import {
  createContext,
  createElement,
  memo,
  use,
  useCallback,
  useEffect,
  useState,
  Component,
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

const DEFAULT_HTML_HEAD = [
  createElement('meta', { charSet: 'utf-8' }),
  createElement('meta', {
    name: 'viewport',
    content: 'width=device-width, initial-scale=1',
  }),
  createElement('meta', { name: 'generator', content: 'Waku' }),
];

const BASE_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE
}/`;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const err = new Error((await response.text()) || response.statusText);
    (err as any).statusCode = response.status;
    throw err;
  }
  return response;
};

type Elements = Promise<Record<string, ReactNode>>;

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
          resolve(nextElements);
        })
        .catch((e) => reject(e));
    });
    return promise;
  };
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type SetElements = (updater: (prev: Elements) => Elements) => void;
type EnhanceFetch = (fetchFn: typeof fetch) => typeof fetch;
type EnhanceCreateData = (
  createData: (
    responsePromise: Promise<Response>,
  ) => Promise<Record<string, ReactNode>>,
) => (responsePromise: Promise<Response>) => Promise<Record<string, ReactNode>>;

const ENTRY = 'e';
const SET_ELEMENTS = 's';
const ENHANCE_FETCH = 'f';
const ENHANCE_CREATE_DATA = 'd';

type FetchCache = {
  [ENTRY]?: [rscPath: string, rscParams: unknown, elements: Elements];
  [SET_ELEMENTS]?: SetElements;
  [ENHANCE_FETCH]?: EnhanceFetch | undefined;
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
  const enhanceFetch = fetchCache[ENHANCE_FETCH] || ((f) => f);
  const enhanceCreateData = fetchCache[ENHANCE_CREATE_DATA] || ((d) => d);
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Awaited<Elements>>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        callServerRsc(funcId, args, fetchCache),
    });
  const url = BASE_PATH + encodeRscPath(encodeFuncId(funcId));
  const responsePromise =
    args.length === 1 && args[0] instanceof URLSearchParams
      ? enhanceFetch(fetch)(url + '?' + args[0])
      : encodeReply(args).then((body) =>
          enhanceFetch(fetch)(url, { method: 'POST', body }),
        );
  const data = enhanceCreateData(createData)(responsePromise);
  const value = (await data)._value;
  // FIXME this causes rerenders even if data is empty
  fetchCache[SET_ELEMENTS]?.((prev) => mergeElements(prev, data));
  return value;
};

const prefetchedParams = new WeakMap<Promise<unknown>, unknown>();

const fetchRscInternal = (
  url: string,
  rscParams: unknown,
  fetchCache: FetchCache,
) => {
  const enhanceFetch = fetchCache[ENHANCE_FETCH] || ((f) => f);
  return rscParams === undefined
    ? enhanceFetch(fetch)(url)
    : rscParams instanceof URLSearchParams
      ? enhanceFetch(fetch)(url + '?' + rscParams)
      : encodeReply(rscParams).then((body) =>
          enhanceFetch(fetch)(url, { method: 'POST', body }),
        );
};

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
    : fetchRscInternal(url, rscParams, fetchCache);
  delete prefetched[url];
  const data = enhanceCreateData(createData)(responsePromise);
  fetchCache[ENTRY] = [rscPath, rscParams, data];
  return data;
};

export const prefetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  fetchCache = defaultFetchCache,
): void => {
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url = BASE_PATH + encodeRscPath(rscPath);
  if (!(url in prefetched)) {
    prefetched[url] = fetchRscInternal(url, rscParams, fetchCache);
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
  unstable_enhanceFetch,
  unstable_enhanceCreateData,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  fetchCache?: FetchCache;
  unstable_enhanceFetch?: EnhanceFetch;
  unstable_enhanceCreateData?: EnhanceCreateData;
  children: ReactNode;
}) => {
  fetchCache[ENHANCE_FETCH] = unstable_enhanceFetch;
  fetchCache[ENHANCE_CREATE_DATA] = unstable_enhanceCreateData;
  const [elements, setElements] = useState(() =>
    fetchRsc(initialRscPath || '', initialRscParams, fetchCache),
  );
  useEffect(() => {
    fetchCache[SET_ELEMENTS] = setElements;
  }, [fetchCache]);
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
    createElement(
      ElementsContext.Provider,
      { value: elements },
      ...DEFAULT_HTML_HEAD,
      children,
    ),
  );
};

export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext.Provider);

const InnerSlot = ({
  id,
  elementsPromise,
  children,
  setFallback,
  unstable_fallback,
}: {
  id: string;
  elementsPromise: Elements;
  children?: ReactNode;
  setFallback?: (fallback: ReactNode) => void;
  unstable_fallback?: ReactNode;
}) => {
  const elements = use(elementsPromise);
  const hasElement = id in elements;
  const element = elements[id];
  useEffect(() => {
    if (hasElement && setFallback) {
      setFallback(element);
    }
  }, [hasElement, element, setFallback]);
  if (!hasElement) {
    if (unstable_fallback) {
      return unstable_fallback;
    }
    throw new Error('No such element: ' + id);
  }
  return createElement(ChildrenContextProvider, { value: children }, element);
};

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

class Fallback extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error?: unknown }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      if (this.props.fallback) {
        return createElement(
          ChildrenContextProvider,
          { value: createElement(ThrowError, { error: this.state.error }) },
          this.props.fallback,
        );
      }
      throw this.state.error;
    }
    return this.props.children;
  }
}

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
  unstable_fallbackToPrev,
  unstable_fallback,
}: {
  id: string;
  children?: ReactNode;
  unstable_fallbackToPrev?: boolean;
  unstable_fallback?: ReactNode;
}) => {
  const [fallback, setFallback] = useState<ReactNode>();
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  if (unstable_fallbackToPrev) {
    return createElement(
      Fallback,
      { fallback } as never,
      createElement(InnerSlot, { id, elementsPromise, setFallback }, children),
    );
  }
  return createElement(
    InnerSlot,
    { id, elementsPromise, unstable_fallback },
    children,
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
}) =>
  createElement(
    ElementsContext.Provider,
    { value: elements },
    ...DEFAULT_HTML_HEAD,
    children,
  );
