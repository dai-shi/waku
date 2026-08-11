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
  let response: Response;
  try {
    response = await responsePromise;
  } catch (e) {
    if (e instanceof TypeError) {
      // fetch reports a network error as a TypeError, so no response arrived
      throw createCustomError(e.message, { unstable_networkError: true });
    }
    throw e;
  }
  if (!response.ok) {
    throw createCustomError((await response.text()) || response.statusText, {
      status: response.status,
    });
  }
  return response;
};

// only the client adds symbol keys; a decoded server payload has string keys
type Elements = Record<string | symbol, unknown>;

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

const getCached = <T,>(c: () => T, m: WeakMap<WeakKey, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;

const resolvedMergeResults = new WeakMap<Promise<Elements>, Elements>();
const swrMergeSources = new WeakMap<Promise<Elements>, Promise<Elements>>();

const mergeCache = new WeakMap();
const mergeElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements> | Elements,
): Promise<Elements> => {
  const getResult = () =>
    Promise.all([a, b]).then(([a, b]) => {
      const nextElements = { ...a, ...b };
      delete nextElements._value;
      return nextElements;
    });
  const cache2 = getCached(() => new WeakMap(), mergeCache, a);
  return getCached(getResult, cache2, b);
};

// a replayed updater has to return the same promise, or the tree never
// settles on the refreshed record (hot-reload.dev.spec.ts)
const refreshCache = new WeakMap();
const refreshElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements>,
): Promise<Elements> => {
  const getResult = () =>
    Promise.all([a, b]).then(([aRes, bRes]) => {
      const nextElements = { ...bRes };
      delete nextElements._value;
      for (const key of Object.getOwnPropertySymbols(aRes)) {
        nextElements[key] = aRes[key];
      }
      return nextElements;
    });
  const cache2 = getCached(() => new WeakMap(), refreshCache, a);
  return getCached(getResult, cache2, b);
};

const slotIdOf = <K extends string | symbol>(key: K): K =>
  typeof key === 'string' && key.startsWith(ETAG_ID_PREFIX)
    ? (key.slice(ETAG_ID_PREFIX.length) as K)
    : key;

const swrCache = new WeakMap();
const swrElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements>,
  pin: (key: string | symbol) => boolean,
  base?: Elements,
  overlay?: Elements,
): Promise<Elements> => {
  const getResult = () => {
    const result: Promise<Elements> = Promise.resolve(a).then((aRes) => {
      const holeFor = (key: string | symbol) =>
        b.then((bRes) =>
          key in bRes ? bRes[key] : base && key in base ? base[key] : aRes[key],
        );
      const nextElements: Elements = {};
      for (const key of Reflect.ownKeys(aRes)) {
        if (key === '_value') {
          continue;
        }
        // an _etag:<slot> key follows its slot's swr-ness, not its own
        nextElements[key] = pin(slotIdOf(key)) ? aRes[key] : holeFor(key);
      }
      if (base) {
        for (const key of Object.keys(base)) {
          if (key === '_value' || key in nextElements) {
            continue;
          }
          // pin only what the base proves immutable; pinning a mutable
          // base key would eagerly serve possibly-stale content
          if (unstable_isImmutableElement(base, slotIdOf(key))) {
            nextElements[key] = base[key];
          } else {
            nextElements[key] = holeFor(key);
          }
        }
      }
      if (overlay) {
        Object.assign(nextElements, overlay);
      }
      resolvedMergeResults.set(result, nextElements);
      return nextElements;
    });
    return result;
  };
  const cache2 = getCached(() => new WeakMap(), swrCache, a);
  const result = getCached(getResult, cache2, b);
  swrMergeSources.set(result, b);
  return result;
};

const swrNewKeysCache = new WeakMap();
const swrNewKeysElementsPromise = (
  prev: Promise<Elements>,
  b: Promise<Elements>,
  bRes: Elements,
  overlay?: Elements,
): Promise<Elements> => {
  if (swrMergeSources.get(prev) !== b) {
    return prev;
  }
  // Object.keys, so a client only symbol key keeps the value it was given
  const overlayKeys = overlay
    ? Object.keys(overlay).filter((key) => key in bRes)
    : [];
  const prevRes = resolvedMergeResults.get(prev);
  if (
    prevRes &&
    !overlayKeys.length &&
    !Object.keys(bRes).some((key) => key !== '_value' && !(key in prevRes))
  ) {
    return prev;
  }
  const getResult = () =>
    Promise.resolve(prev).then((prevRes) => {
      const newKeys = Object.keys(bRes).filter(
        (key) => key !== '_value' && !(key in prevRes),
      );
      if (!newKeys.length && !overlayKeys.length) {
        return prevRes;
      }
      const nextElements = { ...prevRes };
      for (const key of newKeys) {
        nextElements[key] = bRes[key];
      }
      for (const key of overlayKeys) {
        nextElements[key] = bRes[key];
      }
      return nextElements;
    });
  const cache2 = getCached(() => new WeakMap(), swrNewKeysCache, prev);
  return getCached(getResult, cache2, bRes);
};

type FetchRscOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  unstable_base?: Elements;
};

type FetchRscElementsOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  etags?: Etags;
  initial?: NonNullable<ReturnType<typeof consumeInitialRscEntry>>;
};

type MergeElementsOptions = {
  unstable_overlay?: Elements;
  unstable_swr?: {
    pin: (key: string | symbol) => boolean;
    base?: Elements;
  };
};

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
  etagsOverride?: Etags,
): Promise<Response> => {
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  const init: RequestInit = {
    headers: {
      [ETAGS_HEADER]: serializeClientEtags(
        etagsOverride ?? fetchRscStore[CACHED_ETAGS] ?? {},
      ),
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
  Promise.resolve(
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        unstable_callServerRsc(funcId, args),
      debugChannel,
      temporaryReferences,
    }),
  ).then((data) => {
    if (typeof data._location !== 'string') {
      return data;
    }
    // no fetch can follow this, so it fails here and the browser goes instead
    throw createCustomError('document navigation', {
      location: data._location,
      unstable_leave: true,
    });
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
): readonly [rscPath: string, rscParams: unknown] => {
  const fetchRscInputTransformers = fetchRscStore[FETCH_RSC_INPUT_TRANSFORMERS];
  if (fetchRscInputTransformers) {
    for (const transformFetchRscInput of fetchRscInputTransformers) {
      [rscPath, rscParams] = transformFetchRscInput(rscPath, rscParams);
    }
  }
  return [rscPath, rscParams];
};

const fetchRscElements = (
  rscPath: string,
  rscParams: unknown,
  options?: FetchRscElementsOptions,
): Promise<Elements> => {
  [rscPath, rscParams] = applyInputTransformers(rscPath, rscParams);
  const initial = options?.initial;
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
        options?.etags,
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
  const { _value: value, ...data } = await fetchRscElements(rscPath, rscParams);
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
 * Registers a transformer that rewrites the RSC path and params before each
 * request. Returns a function that unregisters the transformer.
 */
export function unstable_registerFetchRscInputTransformer(
  transformFetchRscInput: FetchRscInputTransformer,
): Unregister {
  const fetchRscInputTransformers = (fetchRscStore[
    FETCH_RSC_INPUT_TRANSFORMERS
  ] ||= new Set());
  fetchRscInputTransformers.add(transformFetchRscInput);
  return () => {
    fetchRscInputTransformers.delete(transformFetchRscInput);
  };
}

/**
 * Registers an RSC reload listener used by development HMR. Listeners coexist
 * by default. With `replace`, it replaces the previous replaceable listener
 * and invalidates Minimal's RSC caches before calling it. Returns a function
 * that unregisters this listener.
 */
export const unstable_registerRscReloadListener = (
  listener: () => void,
  options?: { replace?: boolean },
): Unregister => {
  if (!import.meta.hot) {
    return () => {};
  }
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  const registered = options?.replace
    ? () => {
        fetchRscStore[CACHED_ETAGS] = {};
        delete fetchRscStore[ENTRY];
        listener();
      }
    : listener;
  const previous = options?.replace
    ? globalThis.__WAKU_REFETCH_RSC__
    : undefined;
  const previousIndex = previous ? listeners.indexOf(previous) : -1;
  if (previousIndex === -1) {
    listeners.push(registered);
  } else {
    listeners.splice(previousIndex, 1, registered);
  }
  if (options?.replace) {
    globalThis.__WAKU_REFETCH_RSC__ = registered;
  }
  return () => {
    const index = listeners.indexOf(registered);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    if (globalThis.__WAKU_REFETCH_RSC__ === registered) {
      globalThis.__WAKU_REFETCH_RSC__ = undefined;
    }
  };
};

const fetchRootRsc = (
  rscPath: string,
  rscParams: unknown,
): Promise<Elements> => {
  const initial = consumeInitialRscEntry();
  return fetchRscElements(
    rscPath,
    rscParams,
    initial ? { initial } : { etags: {} },
  );
};

/**
 * Fetch and decode elements for an RSC path. Each call starts a new request;
 * consumers own prefetching and response reuse.
 */
export const unstable_fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  options?: FetchRscOptions,
): Promise<Elements> => {
  const base = options?.unstable_base;
  const elements = fetchRscElements(rscPath, rscParams, {
    // Etags can only claim elements from a base the caller retains.
    etags: collectCachedEtags(base ?? {}),
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.onBuildIdMismatch
      ? { onBuildIdMismatch: options.onBuildIdMismatch }
      : {}),
  });
  if (!base) {
    return elements;
  }
  return elements.then((response) => ({ ...base, ...response }));
};

const getInitialRsc = (
  rscPath: string,
  rscParams: unknown,
): Promise<Elements> => {
  if (import.meta.hot) {
    unstable_registerRscReloadListener(
      () => {
        const data = fetchRootRsc(rscPath, rscParams);
        const setElements = getSetElements();
        setElements((prev) => refreshElementsPromise(prev, data));
      },
      { replace: true },
    );
  }
  const entry = fetchRscStore[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const data = fetchRootRsc(rscPath, rscParams);
  fetchRscStore[ENTRY] = [rscPath, rscParams, data];
  return data;
};

type MergeElements = (
  elements: Elements | Promise<Elements>,
  options?: MergeElementsOptions,
) => Promise<Elements>;
const MergeElementsContext = createContext<MergeElements>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Promise<Elements> | null>(null);

/**
 * Client root. Seeds the initial elements, bridges the store to React state,
 * and provides the elements to `Slot` descendants.
 */
export const Root_UNSTABLE = ({
  initialRscPath,
  initialRscParams,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    getInitialRsc(initialRscPath || '', initialRscParams),
  );
  useEffect(() => {
    fetchRscStore[SET_ELEMENTS] = setElements;
  }, []);
  useEffect(() => {
    elements.then(updateCachedEtags, () => {});
  }, [elements]);
  const mergeElements = useCallback<MergeElements>((data, options) => {
    const { unstable_overlay: overlay, unstable_swr: swr } = options ?? {};
    const elements = Promise.resolve(data);
    const elementsWithoutErrors = elements.catch(() => ({}));
    if (swr) {
      setElements((prev) =>
        swrElementsPromise(
          prev,
          elementsWithoutErrors,
          swr.pin,
          swr.base,
          overlay,
        ),
      );
      return elements.then((resolved) => {
        setElements((prev) =>
          swrNewKeysElementsPromise(
            prev,
            elementsWithoutErrors,
            resolved,
            overlay,
          ),
        );
        return resolved;
      });
    }
    // the overlay lands only when the fetch succeeds
    const elementsToMerge = overlay
      ? mergeElementsPromise(elements, overlay).catch(() => ({}))
      : elementsWithoutErrors;
    setElements((prev) => mergeElementsPromise(prev, elementsToMerge));
    return elements;
  }, []);
  return (
    <MergeElementsContext value={mergeElements}>
      <ElementsContext value={elements}>
        {DEFAULT_HTML_HEAD}
        {children}
      </ElementsContext>
    </MergeElementsContext>
  );
};

/**
 * Returns a function that merges an element record or pending RSC payload into
 * the current `Root_UNSTABLE`. A rejected payload leaves the current elements
 * unchanged.
 */
export const useMergeElements_UNSTABLE = () => use(MergeElementsContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext);

/** Render the client children passed to the enclosing Slot. */
export const Children_UNSTABLE = () => use(ChildrenContext);

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
 */
export const Slot_UNSTABLE = ({
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

export const INTERNAL_ServerRoot = ({
  elementsPromise,
  children,
}: {
  elementsPromise: Promise<Elements>;
  children: ReactNode;
}) => (
  <MergeElementsContext value={async () => ({})}>
    <ElementsContext value={elementsPromise}>
      {DEFAULT_HTML_HEAD}
      {children}
    </ElementsContext>
  </MergeElementsContext>
);

// Expose internal APIs
// Subject to change without notice
export {
  addBase as unstable_addBase,
  removeBase as unstable_removeBase,
} from '../lib/utils/path.js';
export { getErrorInfo as unstable_getErrorInfo } from '../lib/utils/custom-errors.js';
