/// <reference types="react/canary" />
'use client';

import {
  createContext,
  createElement,
  memo,
  use,
  useCallback,
  useState,
  startTransition,
} from 'react';
import type { ReactNode } from 'react';
import RSDWClient from 'react-server-dom-webpack/client';

import { encodeInput, encodeActionId } from './lib/renderers/utils.js';

const { createFromFetch, encodeReply } = RSDWClient;

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const BASE_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH}${
  import.meta.env?.WAKU_CONFIG_RSC_PATH
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
type CacheEntry = [
  input: string,
  searchParamsString: string,
  setElements: SetElements,
  elements: Elements,
];

const fetchCache: [CacheEntry?] = [];

export const fetchRSC = (
  input: string,
  searchParamsString: string,
  setElements: SetElements,
  cache = fetchCache,
  unstable_onFetchData?: (data: unknown) => void,
): Elements => {
  let entry: CacheEntry | undefined = cache[0];
  if (entry && entry[0] === input && entry[1] === searchParamsString) {
    entry[2] = setElements;
    return entry[3];
  }
  const options = {
    async callServer(actionId: string, args: unknown[]) {
      const response = fetch(
        BASE_PATH + encodeInput(encodeActionId(actionId)),
        {
          method: 'POST',
          body: await encodeReply(args),
        },
      );
      const data = createFromFetch<Awaited<Elements>>(
        checkStatus(response),
        options,
      );
      unstable_onFetchData?.(data);
      const setElements = entry![2];
      startTransition(() => {
        // FIXME this causes rerenders even if data is empty
        setElements((prev) => mergeElements(prev, data));
      });
      return (await data)._value;
    },
  };
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url =
    BASE_PATH +
    encodeInput(input) +
    (searchParamsString ? '?' + searchParamsString : '');
  const response = prefetched[url] || fetch(url);
  delete prefetched[url];
  const data = createFromFetch<Awaited<Elements>>(
    checkStatus(response),
    options,
  );
  unstable_onFetchData?.(data);
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  cache[0] = entry = [input, searchParamsString, setElements, data];
  return data;
};

export const prefetchRSC = (
  input: string,
  searchParamsString: string,
): void => {
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const url =
    BASE_PATH +
    encodeInput(input) +
    (searchParamsString ? '?' + searchParamsString : '');
  if (!(url in prefetched)) {
    prefetched[url] = fetch(url);
  }
};

const RefetchContext = createContext<
  (input: string, searchParams?: URLSearchParams) => void
>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Elements | null>(null);

export const Root = ({
  initialInput,
  initialSearchParamsString,
  cache,
  unstable_onFetchData,
  children,
}: {
  initialInput?: string;
  initialSearchParamsString?: string;
  cache?: typeof fetchCache;
  unstable_onFetchData?: (data: unknown) => void;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    fetchRSC(
      initialInput || '',
      initialSearchParamsString || '',
      (fn) => setElements(fn),
      cache,
      unstable_onFetchData,
    ),
  );
  const refetch = useCallback(
    (input: string, searchParams?: URLSearchParams) => {
      (cache || fetchCache).splice(0); // clear cache before fetching
      const data = fetchRSC(
        input,
        searchParams?.toString() || '',
        setElements,
        cache,
        unstable_onFetchData,
      );
      setElements((prev) => mergeElements(prev, data));
    },
    [cache, unstable_onFetchData],
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

export const Slot = ({
  id,
  children,
  fallback,
  unstable_shouldRenderPrev,
}: {
  id: string;
  children?: ReactNode;
  fallback?: ReactNode;
  unstable_shouldRenderPrev?: (err: unknown) => boolean;
}) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  let elements: Awaited<Elements>;
  try {
    elements = use(elementsPromise);
  } catch (e) {
    if (e instanceof Error && !('statusCode' in e)) {
      // HACK we assume any error as Not Found,
      // probably caused by history api fallback
      (e as any).statusCode = 404;
    }
    if (unstable_shouldRenderPrev?.(e) && elementsPromise.prev) {
      elements = elementsPromise.prev;
    } else {
      throw e;
    }
  }
  if (!(id in elements)) {
    if (fallback) {
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

export const Children = () => use(ChildrenContext);

/**
 * ServerRoot for SSR
 * This is not a public API.
 */
export const ServerRoot = ({
  elements,
  children,
}: {
  elements: Elements;
  children: ReactNode;
}) => createElement(ElementsContext.Provider, { value: elements }, children);
