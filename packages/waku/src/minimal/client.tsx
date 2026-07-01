'use client';

import {
  createContext,
  memo,
  startTransition,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import RSDWClient from 'react-server-dom-webpack/client';
import { createCustomError } from '../lib/utils/custom-errors.js';
import {
  ETAGS_HEADER,
  ETAG_ID_PREFIX,
  IMMUTABLE_ETAG,
  isValidEtag,
  serializeClientEtags,
} from '../lib/utils/etags.js';
import type { Etags } from '../lib/utils/etags.js';
import { consumeInitialRscEntry } from '../lib/utils/initial-rsc.js';
import { setupDebugChannel } from '../lib/utils/react-debug-channel.js';
import { encodeFuncId, encodeRscPath } from '../lib/utils/rsc-path.js';
import {
  CACHED_ETAGS,
  CALL_SERVER_ELEMENTS_LISTENERS,
  ENTRY,
  FETCH_ENHANCERS,
  FETCH_RSC_INPUT_TRANSFORMERS,
  SET_ELEMENTS,
  fetchRscStore,
} from './client-utils/fetch-store.js';
import type {
  FetchEnhancer,
  FetchRscInputTransformer,
  SetElements,
} from './client-utils/fetch-store.js';

const { createFromFetch, encodeReply, createTemporaryReferenceSet } =
  RSDWClient;

const DEFAULT_HTML_HEAD = [
  <meta charSet="utf-8" key="charset" />,
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
    key="viewport"
  />,
  <meta name="generator" content="Waku" key="generator" />,
];

const BASE_RSC_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/'}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE ?? 'RSC'
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

const collectCachedEtags = (elements: Elements): Etags => {
  const etags: Etags = {};
  for (const [key, value] of Object.entries(elements)) {
    if (key.startsWith(ETAG_ID_PREFIX) && isValidEtag(value)) {
      etags[key.slice(ETAG_ID_PREFIX.length)] = value;
    }
  }
  return etags;
};

const updateCachedEtags = (elements: Elements): void => {
  fetchRscStore[CACHED_ETAGS] = collectCachedEtags(elements);
};

export const unstable_isImmutableElement = (
  elements: Elements,
  slotId: string,
): boolean => elements[ETAG_ID_PREFIX + slotId] === IMMUTABLE_ETAG;

// TODO(daishi) do we still need this?
const getCached = <T,>(c: () => T, m: WeakMap<WeakKey, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;

const cache1 = new WeakMap();
const mergeElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements> | Elements,
  isSwr?: (key: string) => boolean,
): Promise<Elements> => {
  const getResult = () => {
    if (!isSwr) {
      return Promise.all([a, b]).then(([a, b]) => {
        const nextElements = { ...a, ...b };
        delete nextElements._value;
        return nextElements;
      });
    }
    return Promise.resolve(a).then((aRes) => {
      const bPromise: Promise<Elements> = Promise.resolve(b);
      const base: Elements = { ...aRes };
      delete base._value;
      return new Proxy(base, {
        get(target, key: string) {
          // an _etag:<slot> key follows its slot's swr-ness, not its own
          const swr = key.startsWith(ETAG_ID_PREFIX)
            ? isSwr(key.slice(ETAG_ID_PREFIX.length))
            : isSwr(key);
          if (
            key !== '_value' &&
            !swr &&
            // a lazy key still equal to aRes's value hasn't been streamed yet
            target[key] === aRes[key]
          ) {
            target[key] = bPromise.then((bRes) =>
              key in bRes ? bRes[key] : aRes[key],
            );
          }
          return target[key];
        },
      });
    });
  };
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type FetchRscOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
};

type Refetch = (
  rscPath: string,
  rscParams?: unknown,
  options?: FetchRscOptions & {
    unstable_isSwr?: (key: string) => boolean;
    unstable_prefetched?: {
      elements: Elements | Promise<Elements>;
      complete?: boolean;
    };
  },
) => Promise<Elements>;

const getFetchFn = (): typeof fetch => {
  let fetchFn = fetch;
  const enhancers = fetchRscStore[FETCH_ENHANCERS];
  if (enhancers) {
    for (const enhance of enhancers) {
      fetchFn = enhance(fetchFn);
    }
  }
  return fetchFn;
};

const getSetElements = (): SetElements => {
  const setElements = fetchRscStore[SET_ELEMENTS];
  if (!setElements) {
    throw new Error('Missing Root component');
  }
  return setElements;
};

const requestRsc = (
  fetchFn: typeof fetch,
  rscPath: string,
  rscParams: unknown,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
  signal: AbortSignal | undefined,
): Promise<Response> => {
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  const init: RequestInit = {
    headers: {
      [ETAGS_HEADER]: serializeClientEtags(fetchRscStore[CACHED_ETAGS] ?? {}),
    },
  };
  if (signal) {
    init.signal = signal;
  }
  if (rscParams === undefined) {
    return fetchFn(url, init);
  }
  if (rscParams instanceof URLSearchParams) {
    return fetchFn(url + '?' + rscParams, init);
  }
  return encodeReply(rscParams, { temporaryReferences }).then((body) =>
    fetchFn(url, { ...init, method: 'POST', body }),
  );
};

const decodeRsc = (
  responsePromise: Promise<Response>,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
  debugChannel:
    ReturnType<typeof setupDebugChannel>['debugChannel'] | undefined,
): Promise<Elements> =>
  createFromFetch<Elements>(checkStatus(responsePromise), {
    callServer: (funcId: string, args: unknown[]) =>
      unstable_callServerRsc(funcId, args),
    debugChannel,
    temporaryReferences,
  });

const reloadOnBuildIdMismatch = (
  elements: Promise<Elements>,
  onBuildIdMismatch: (() => void) | undefined,
) => {
  if (!import.meta.env?.WAKU_BUILD_ID) {
    return;
  }
  Promise.resolve(elements).then(
    (data) => {
      if (data._buildId !== import.meta.env.WAKU_BUILD_ID) {
        (onBuildIdMismatch ?? (() => window.location.reload()))();
      }
    },
    () => {},
  );
};

const applyInputTransformers = (
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
): readonly [rscPath: string, rscParams: unknown, prefetchOnly: boolean] => {
  const fetchRscInputTransformers = fetchRscStore[FETCH_RSC_INPUT_TRANSFORMERS];
  if (fetchRscInputTransformers) {
    for (const transformFetchRscInput of fetchRscInputTransformers) {
      [rscPath, rscParams, prefetchOnly] = transformFetchRscInput(
        rscPath,
        rscParams,
        prefetchOnly,
      );
    }
  }
  return [rscPath, rscParams, prefetchOnly];
};

const fetchRscElements = (
  rscPath: string,
  rscParams: unknown,
  options: FetchRscOptions | undefined,
): Promise<Elements> => {
  [rscPath, rscParams] = applyInputTransformers(rscPath, rscParams, false);
  const initial = consumeInitialRscEntry();
  const baseFetchFn = getFetchFn();
  const debug = import.meta.hot
    ? setupDebugChannel(baseFetchFn, !!initial, initial?.debugId)
    : undefined;
  const fetchFn = debug?.fetchFn || baseFetchFn;
  const temporaryReferences = createTemporaryReferenceSet();
  const responsePromise = initial
    ? initial.response
    : requestRsc(
        fetchFn,
        rscPath,
        rscParams,
        temporaryReferences,
        options?.signal,
      );
  const elements = decodeRsc(
    responsePromise,
    temporaryReferences,
    debug?.debugChannel,
  );
  reloadOnBuildIdMismatch(elements, options?.onBuildIdMismatch);
  return elements;
};

/**
 * callServer callback
 * This is not a public API.
 */
export const unstable_callServerRsc = async (
  funcId: string,
  args: unknown[],
) => {
  const rscPath = encodeFuncId(funcId);
  const rscParams =
    args.length === 1 && args[0] instanceof URLSearchParams ? args[0] : args;
  const { _value: value, ...data } = await fetchRscElements(
    rscPath,
    rscParams,
    undefined,
  );
  if (Object.keys(data).length) {
    const setElements = getSetElements();
    const callServerElementsListeners =
      fetchRscStore[CALL_SERVER_ELEMENTS_LISTENERS];
    startTransition(() => {
      callServerElementsListeners?.forEach((listener) => {
        listener(data);
      });
      setElements((prev) => mergeElementsPromise(prev, data));
    });
  }
  return value;
};

type Unregister = () => void;

/**
 * Register a listener that runs when a server action returns new elements.
 * Returns a function that unregisters the listener.
 */
export const unstable_registerCallServerElementsListener = (
  listener: (elements: Elements) => void,
): Unregister => {
  const callServerElementsListeners = (fetchRscStore[
    CALL_SERVER_ELEMENTS_LISTENERS
  ] ||= new Set());
  callServerElementsListeners.add(listener);
  return () => {
    callServerElementsListeners.delete(listener);
  };
};

/**
 * Register a fetch enhancer applied to every RSC request (e.g. to add headers).
 * Enhancers are composed in registration order. Returns a function that
 * unregisters the enhancer.
 */
export const unstable_registerFetchEnhancer = (
  enhance: FetchEnhancer,
): Unregister => {
  const fetchEnhancers = (fetchRscStore[FETCH_ENHANCERS] ||= new Set());
  fetchEnhancers.add(enhance);
  return () => {
    fetchEnhancers.delete(enhance);
  };
};

/**
 * Register a transformer that rewrites the RSC fetch input
 * (`rscPath`, `rscParams`, `prefetchOnly`) before each request. Returns a
 * function that unregisters the transformer.
 */
export const unstable_registerFetchRscInputTransformer = (
  transformFetchRscInput: FetchRscInputTransformer,
): Unregister => {
  const fetchRscInputTransformers = (fetchRscStore[
    FETCH_RSC_INPUT_TRANSFORMERS
  ] ||= new Set());
  fetchRscInputTransformers.add(transformFetchRscInput);
  return () => {
    fetchRscInputTransformers.delete(transformFetchRscInput);
  };
};

const registerHmrRefetch = (refetch: () => void) => {
  const reload = () => {
    fetchRscStore[CACHED_ETAGS] = {};
    refetch();
  };
  globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
  const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
    globalThis.__WAKU_REFETCH_RSC__!,
  );
  if (index !== -1) {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, reload);
  } else {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.push(reload);
  }
  globalThis.__WAKU_REFETCH_RSC__ = reload;
};

/** Fetch elements for an RSC path, reusing a cached or prefetched result. */
export const unstable_fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  options?: FetchRscOptions,
): Promise<Elements> => {
  if (import.meta.hot) {
    registerHmrRefetch(() => {
      delete fetchRscStore[ENTRY];
      const data = unstable_fetchRsc(rscPath, rscParams, options);
      getSetElements()(() => data);
    });
  }
  const entry = fetchRscStore[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const data = fetchRscElements(rscPath, rscParams, options);
  fetchRscStore[ENTRY] = [rscPath, rscParams, data];
  return data;
};

/** Fetch + decode a route's elements; the caller (the router) holds the result. */
export const unstable_prefetchRsc = (
  rscPath: string,
  rscParams?: unknown,
): Promise<Elements> => {
  // Transformers must be prefetchOnly-agnostic (prefetches reused as navs).
  [rscPath, rscParams] = applyInputTransformers(rscPath, rscParams, true);
  const temporaryReferences = createTemporaryReferenceSet();
  const responsePromise = requestRsc(
    getFetchFn(),
    rscPath,
    rscParams,
    temporaryReferences,
    undefined,
  );
  return decodeRsc(responsePromise, temporaryReferences, undefined);
};

const RefetchContext = createContext<Refetch>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Promise<Elements> | null>(null);

/**
 * Client root. Seeds the initial elements, bridges the store to React state,
 * and provides the elements to `Slot` descendants.
 *
 * This API is technically unstable and may change or be removed,
 * even though it does not carry the `unstable_` prefix.
 */
export const Root = ({
  initialRscPath,
  initialRscParams,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    unstable_fetchRsc(initialRscPath || '', initialRscParams),
  );
  useEffect(() => {
    fetchRscStore[SET_ELEMENTS] = setElements;
  }, []);
  useEffect(() => {
    elements.then(updateCachedEtags, () => {});
  }, [elements]);
  const refetch = useCallback<Refetch>(async (rscPath, rscParams, options) => {
    const { unstable_isSwr: isSwr, unstable_prefetched: prefetched } =
      options ?? {};
    delete fetchRscStore[ENTRY];
    let data: Promise<Elements>;
    if (prefetched?.complete) {
      data = Promise.resolve(prefetched.elements);
      reloadOnBuildIdMismatch(data, options?.onBuildIdMismatch);
    } else {
      data = unstable_fetchRsc(rscPath, rscParams, options);
    }
    const dataWithoutErrors = Promise.resolve(data).catch(() => ({}));
    setElements((prev) => mergeElementsPromise(prev, dataWithoutErrors, isSwr));
    return data;
  }, []);
  return (
    <RefetchContext value={refetch}>
      <ElementsContext value={elements}>
        {DEFAULT_HTML_HEAD}
        {children}
      </ElementsContext>
    </RefetchContext>
  );
};

/**
 * This API is technically unstable and may change or be removed,
 * even though it does not carry the `unstable_` prefix.
 */
export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext);

/**
 * This API is technically unstable and may change or be removed,
 * even though it does not carry the `unstable_` prefix.
 */
export const Children = () => use(ChildrenContext);

export const useElementsPromise_UNSTABLE = () => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  return elementsPromise;
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
 *
 * This API is technically unstable and may change or be removed,
 * even though it does not carry the `unstable_` prefix.
 */
export const Slot = ({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) => {
  const elementsPromise = useElementsPromise_UNSTABLE();
  const elements = use(elementsPromise);
  if (id in elements && elements[id] === undefined) {
    throw new Error('Element cannot be undefined, use null instead: ' + id);
  }
  const element = elements[id];
  const isValidElement = element !== undefined;
  if (!isValidElement) {
    throw new Error('Invalid element: ' + id);
  }
  return (
    <ChildrenContextProvider value={children}>
      {element as ReactNode}
    </ChildrenContextProvider>
  );
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
}) => (
  <RefetchContext value={async () => ({})}>
    <ElementsContext value={elementsPromise}>
      {DEFAULT_HTML_HEAD}
      {children}
    </ElementsContext>
  </RefetchContext>
);

// Expose internal APIs
// Subject to change without notice
export {
  addBase as unstable_addBase,
  removeBase as unstable_removeBase,
} from '../lib/utils/path.js';
export { getErrorInfo as unstable_getErrorInfo } from '../lib/utils/custom-errors.js';
