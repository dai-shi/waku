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

import { createCustomError } from '../lib/utils/custom-errors.js';
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

const BASE_RSC_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE
}/`;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const location = response.headers.get('location');
    const err = createCustomError(
      (await response.text()) || response.statusText,
      {
        status: response.status,
        ...(location && { location }),
      },
    );
    throw err;
  }
  return response;
};

type Elements = Record<string, unknown>;

// HACK I'm not super happy with this hack
const erroredElementsPromiseMap = new WeakMap<
  Promise<Elements>,
  Promise<Elements>
>();

const getCached = <T>(c: () => T, m: WeakMap<object, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;
const cache1 = new WeakMap();
const mergeElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements>,
): Promise<Elements> => {
  const getResult = () => {
    const p = Promise.all([erroredElementsPromiseMap.get(a) || a, b])
      .then(([a, b]) => {
        const nextElements = { ...a, ...b };
        delete nextElements._value;
        return nextElements;
      })
      .catch((err) => {
        erroredElementsPromiseMap.set(p, a);
        throw err;
      });
    return p;
  };
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type SetElements = (
  updater: (prev: Promise<Elements>) => Promise<Elements>,
) => void;
type EnhanceFetch = (fetchFn: typeof fetch) => typeof fetch;
type EnhanceCreateData = (
  createData: (responsePromise: Promise<Response>) => Promise<Elements>,
) => (responsePromise: Promise<Response>) => Promise<Elements>;

const ENTRY = 'e';
const SET_ELEMENTS = 's';
const ENHANCE_FETCH = 'f';
const ENHANCE_CREATE_DATA = 'd';

type FetchCache = {
  [ENTRY]?: [
    rscPath: string,
    rscParams: unknown,
    elementsPromise: Promise<Elements>,
  ];
  [SET_ELEMENTS]?: SetElements;
  [ENHANCE_FETCH]?: EnhanceFetch | undefined;
  [ENHANCE_CREATE_DATA]?: EnhanceCreateData | undefined;
};

const defaultFetchCache: FetchCache = {};

/**
 * callServer callback
 * This is not a public API.
 */
export const unstable_callServerRsc = async (
  funcId: string,
  args: unknown[],
  fetchCache = defaultFetchCache,
) => {
  const enhanceFetch = fetchCache[ENHANCE_FETCH] || ((f) => f);
  const enhanceCreateData = fetchCache[ENHANCE_CREATE_DATA] || ((d) => d);
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        unstable_callServerRsc(funcId, args, fetchCache),
    });
  const url = BASE_RSC_PATH + encodeRscPath(encodeFuncId(funcId));
  const responsePromise =
    args.length === 1 && args[0] instanceof URLSearchParams
      ? enhanceFetch(fetch)(url + '?' + args[0])
      : encodeReply(args).then((body) =>
          enhanceFetch(fetch)(url, { method: 'POST', body }),
        );
  const data = enhanceCreateData(createData)(responsePromise);
  const value = (await data)._value;
  // FIXME this causes rerenders even if data is empty
  fetchCache[SET_ELEMENTS]?.((prev) => mergeElementsPromise(prev, data));
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
): Promise<Elements> => {
  const entry = fetchCache[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const enhanceCreateData = fetchCache[ENHANCE_CREATE_DATA] || ((d) => d);
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        unstable_callServerRsc(funcId, args, fetchCache),
    });
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
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
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
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
const ElementsContext = createContext<Promise<Elements> | null>(null);

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
      setElements((prev) => mergeElementsPromise(prev, data));
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
const ErrorContext = createContext<
  [error: unknown, reset: () => void] | undefined
>(undefined);
const ErrorContextProvider = memo(ErrorContext.Provider);

export const Children = () => use(ChildrenContext);

export const ThrowError_UNSTABLE = () => {
  const errAndReset = use(ErrorContext);
  if (errAndReset) {
    throw errAndReset[0];
  }
  return null;
};

export const useResetError_UNSTABLE = () => {
  const errAndReset = use(ErrorContext);
  if (errAndReset) {
    return errAndReset[1];
  }
};

export const useElement = (id: string) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  const elements = use(elementsPromise);
  if (id in elements && elements[id] == undefined) {
    throw new Error('Element cannot be undefined, use null instead: ' + id);
  }
  return elements[id];
};

const InnerSlot = ({
  id,
  children,
  setValidElement,
  unstable_fallback,
}: {
  id: string;
  children?: ReactNode;
  setValidElement?: (element: ReactNode) => void;
  unstable_fallback?: ReactNode;
}) => {
  const element = useElement(id);
  const isValidElement = element !== undefined;
  useEffect(() => {
    if (isValidElement && setValidElement) {
      // FIXME is there `isReactNode` type checker?
      setValidElement(element as ReactNode);
    }
  }, [isValidElement, element, setValidElement]);
  if (!isValidElement) {
    if (unstable_fallback) {
      return unstable_fallback;
    }
    throw new Error('Invalid element: ' + id);
  }
  return createElement(
    ChildrenContextProvider,
    { value: children },
    // FIXME is there `isReactNode` type checker?
    element as ReactNode,
  );
};

class GeneralErrorHandler extends Component<
  { children?: ReactNode; errorHandler: ReactNode },
  { error: unknown | null }
> {
  constructor(props: { children?: ReactNode; errorHandler: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      if (this.props.errorHandler) {
        return createElement(
          ErrorContextProvider,
          { value: [error, this.reset] },
          this.props.errorHandler,
        );
      }
      throw error;
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
  unstable_handleError,
  unstable_fallback,
}: {
  id: string;
  children?: ReactNode;
  unstable_handleError?: ReactNode;
  unstable_fallback?: ReactNode;
}) => {
  const [errorHandler, setErrorHandler] = useState<ReactNode>();
  const setValidElement = useCallback(
    (element: ReactNode) =>
      setErrorHandler(
        createElement(
          ChildrenContextProvider,
          { value: unstable_handleError },
          element,
        ),
      ),
    [unstable_handleError],
  );
  if (unstable_handleError !== undefined) {
    return createElement(
      GeneralErrorHandler,
      { errorHandler },
      createElement(InnerSlot, { id, setValidElement }, children),
    );
  }
  return createElement(InnerSlot, { id, unstable_fallback }, children);
};

/**
 * ServerRoot for SSR
 * This is not a public API.
 */
export const INTERNAL_ServerRoot = ({
  elementsPromise,
  children,
}: {
  elementsPromise: Promise<Elements>;
  children: ReactNode;
}) =>
  createElement(
    ElementsContext.Provider,
    { value: elementsPromise },
    ...DEFAULT_HTML_HEAD,
    children,
  );
