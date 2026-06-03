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
import { consumeInitialRscEntry } from '../lib/utils/initial-rsc.js';
import {
  addPrefetchEntry,
  consumePrefetchEntry,
  hasPrefetchEntry,
} from '../lib/utils/prefetch-cache.js';
import { setupDebugChannel } from '../lib/utils/react-debug-channel.js';
import { encodeFuncId, encodeRscPath } from '../lib/utils/rsc-path.js';
import { waitForRootPrerequisites } from '../lib/utils/rsc-stream.js';

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

// TODO(daishi) do we still this?
const getCached = <T,>(c: () => T, m: WeakMap<WeakKey, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;

const cache1 = new WeakMap();
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
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type SetElements = (
  updater: (prev: Promise<Elements>) => Promise<Elements>,
) => void;

const ENTRY = 'e';
const SET_ELEMENTS = 's';
const FETCH_FN = 'f';
const FETCH_RSC_INPUT_TRANSFORMERS = 't';
const CALL_SERVER_ELEMENTS_LISTENERS = 'l';
const ON_BUILD_ID_MISMATCH = 'b';

type TransformFetchRscInput = (
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => readonly [rscPath: string, rscParams: unknown, prefetchOnly: boolean];
type FetchRscInputTransformers = Set<TransformFetchRscInput>;

type CallServerElementsListeners = Set<(elements: Elements) => void>;

type FetchRscInternal = {
  (
    fetchRscStore: Unstable_FetchRscStore,
    rscPath: string,
    rscParams: unknown,
    prefetchOnly: false,
  ): Promise<Elements>;
  (
    fetchRscStore: Unstable_FetchRscStore,
    rscPath: string,
    rscParams: unknown,
    prefetchOnly: true,
  ): void;
};

type Unstable_FetchRscStore = {
  [ENTRY]?: [
    rscPath: string,
    rscParams: unknown,
    elementsPromise: Promise<Elements>,
  ];
  [SET_ELEMENTS]?: SetElements;
  [FETCH_FN]?: typeof fetch;
  [FETCH_RSC_INPUT_TRANSFORMERS]?: FetchRscInputTransformers;
  [CALL_SERVER_ELEMENTS_LISTENERS]?: CallServerElementsListeners;
  [ON_BUILD_ID_MISMATCH]?: () => void;
};

const defaultFetchRscStore: Unstable_FetchRscStore = {};

const requestRsc = (
  fetchFn: typeof fetch,
  rscPath: string,
  rscParams: unknown,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
): Promise<Response> => {
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  if (rscParams === undefined) {
    return fetchFn(url);
  }
  if (rscParams instanceof URLSearchParams) {
    return fetchFn(url + '?' + rscParams);
  }
  return encodeReply(rscParams, { temporaryReferences }).then((body) =>
    fetchFn(url, { method: 'POST', body }),
  );
};

// `getStore` is read lazily when a server action fires: a prefetched tree is
// decoded early but must act against the consuming navigation's store.
const decodeRsc = (
  getStore: () => Unstable_FetchRscStore,
  responsePromise: Promise<Response>,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
  debugChannel:
    | ReturnType<typeof setupDebugChannel>['debugChannel']
    | undefined,
): Promise<Elements> =>
  createFromFetch<Elements>(checkStatus(responsePromise), {
    callServer: (funcId: string, args: unknown[]) =>
      unstable_callServerRsc(funcId, args, getStore),
    debugChannel,
    temporaryReferences,
  });

const reloadOnBuildIdMismatch = (
  fetchRscStore: Unstable_FetchRscStore,
  elements: Promise<Elements>,
) => {
  if (!import.meta.env?.WAKU_BUILD_ID) {
    return;
  }
  Promise.resolve(elements).then(
    (data) => {
      if (data._buildId !== import.meta.env.WAKU_BUILD_ID) {
        (
          fetchRscStore[ON_BUILD_ID_MISMATCH] ??
          (() => window.location.reload())
        )();
      }
    },
    () => {},
  );
};

const prefetchRscInternal = (
  fetchRscStore: Unstable_FetchRscStore,
  rscPath: string,
  rscParams: unknown,
): void => {
  const fetchFn = fetchRscStore[FETCH_FN] || fetch;
  const temporaryReferences = createTemporaryReferenceSet();
  const responsePromise = requestRsc(
    fetchFn,
    rscPath,
    rscParams,
    temporaryReferences,
  );
  addPrefetchEntry(rscPath, rscParams, fetchRscStore, (getStore) =>
    decodeRsc(getStore, responsePromise, temporaryReferences, undefined),
  );
};

const fetchRscElements = (
  fetchRscStore: Unstable_FetchRscStore,
  rscPath: string,
  rscParams: unknown,
): Promise<Elements> => {
  const prefetched = consumePrefetchEntry<
    Unstable_FetchRscStore,
    Promise<Elements>
  >(rscPath, rscParams, fetchRscStore);
  if (prefetched) {
    reloadOnBuildIdMismatch(fetchRscStore, prefetched);
    return prefetched;
  }
  const initial = consumeInitialRscEntry();
  const baseFetchFn = fetchRscStore[FETCH_FN] || fetch;
  const debug = import.meta.hot
    ? setupDebugChannel(baseFetchFn, !!initial, initial?.debugId)
    : undefined;
  const fetchFn = debug?.fetchFn || baseFetchFn;
  const temporaryReferences = createTemporaryReferenceSet();
  const responsePromise = initial
    ? initial.response
    : requestRsc(fetchFn, rscPath, rscParams, temporaryReferences);
  const elements = decodeRsc(
    () => fetchRscStore,
    responsePromise,
    temporaryReferences,
    debug?.debugChannel,
  );
  reloadOnBuildIdMismatch(fetchRscStore, elements);
  if (initial) {
    const { close } = initial;
    waitForRootPrerequisites(elements).then(close, close);
  }
  return elements;
};

const applyInputTransformers = (
  fetchRscStore: Unstable_FetchRscStore,
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

const fetchRscInternal: FetchRscInternal = (
  fetchRscStore: Unstable_FetchRscStore,
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => {
  [rscPath, rscParams, prefetchOnly] = applyInputTransformers(
    fetchRscStore,
    rscPath,
    rscParams,
    prefetchOnly,
  );
  if (prefetchOnly) {
    if (!hasPrefetchEntry(rscPath, rscParams)) {
      prefetchRscInternal(fetchRscStore, rscPath, rscParams);
    }
    return undefined as never;
  }
  return fetchRscElements(fetchRscStore, rscPath, rscParams);
};

/**
 * callServer callback
 * This is not a public API.
 */
export const unstable_callServerRsc = async (
  funcId: string,
  args: unknown[],
  unstable_enhanceFetchRscStore: (
    s: Unstable_FetchRscStore,
  ) => Unstable_FetchRscStore = (s) => s,
) => {
  const fetchRscStore = unstable_enhanceFetchRscStore(defaultFetchRscStore);
  const setElements = fetchRscStore[SET_ELEMENTS]!;
  const callServerElementsListeners =
    fetchRscStore[CALL_SERVER_ELEMENTS_LISTENERS];
  const rscPath = encodeFuncId(funcId);
  const rscParams =
    args.length === 1 && args[0] instanceof URLSearchParams ? args[0] : args;
  const { _value: value, ...data } = await fetchRscInternal(
    fetchRscStore,
    rscPath,
    rscParams,
    false,
  );
  if (Object.keys(data).length) {
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
export const unstable_registerCallServerElementsListener = (
  fetchRscStore: Unstable_FetchRscStore,
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

export const unstable_registerFetchRscInputTransformer = (
  fetchRscStore: Unstable_FetchRscStore,
  transformFetchRscInput: TransformFetchRscInput,
): Unregister => {
  const fetchRscInputTransformers =
    fetchRscStore[FETCH_RSC_INPUT_TRANSFORMERS] ||
    (fetchRscStore[FETCH_RSC_INPUT_TRANSFORMERS] = new Set());
  fetchRscInputTransformers.add(transformFetchRscInput);
  return () => {
    fetchRscInputTransformers.delete(transformFetchRscInput);
  };
};

export const unstable_fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  unstable_enhanceFetchRscStore: (
    s: Unstable_FetchRscStore,
  ) => Unstable_FetchRscStore = (s) => s,
): Promise<Elements> => {
  const fetchRscStore = unstable_enhanceFetchRscStore(defaultFetchRscStore);
  if (import.meta.hot) {
    const refetchRsc = () => {
      delete fetchRscStore[ENTRY];
      const data = unstable_fetchRsc(
        rscPath,
        rscParams,
        unstable_enhanceFetchRscStore,
      );
      fetchRscStore[SET_ELEMENTS]!(() => data);
    };
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
    const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
      globalThis.__WAKU_REFETCH_RSC__!,
    );
    if (index !== -1) {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRsc);
    } else {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.push(refetchRsc);
    }
    globalThis.__WAKU_REFETCH_RSC__ = refetchRsc;
  }

  const entry = fetchRscStore[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const data = fetchRscInternal(fetchRscStore, rscPath, rscParams, false);
  fetchRscStore[ENTRY] = [rscPath, rscParams, data];
  return data;
};

export const unstable_prefetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  unstable_enhanceFetchRscStore: (
    s: Unstable_FetchRscStore,
  ) => Unstable_FetchRscStore = (s) => s,
): void => {
  const fetchRscStore = unstable_enhanceFetchRscStore(defaultFetchRscStore);
  fetchRscInternal(fetchRscStore, rscPath, rscParams, true);
};

export const unstable_withEnhanceFetchFn =
  (enhanceFetchFn: (fn: typeof fetch) => typeof fetch) =>
  (fetchRscStore: Unstable_FetchRscStore): Unstable_FetchRscStore => ({
    ...fetchRscStore,
    [FETCH_FN]: enhanceFetchFn(fetchRscStore[FETCH_FN] || fetch),
  });

export const unstable_withBuildIdMismatchHandler =
  (handler: () => void) =>
  (fetchRscStore: Unstable_FetchRscStore): Unstable_FetchRscStore => ({
    ...fetchRscStore,
    [ON_BUILD_ID_MISMATCH]: handler,
  });

const RefetchContext = createContext<
  (
    rscPath: string,
    rscParams?: unknown,
    unstable_enhanceFetchRscStore?: (
      c: Unstable_FetchRscStore,
    ) => Unstable_FetchRscStore,
  ) => Promise<Elements>
>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Promise<Elements> | null>(null);
const FetchRscStoreContext = createContext<Unstable_FetchRscStore | null>(null);

export const useFetchRscStore_UNSTABLE = () => {
  const fetchRscStore = use(FetchRscStoreContext);
  if (!fetchRscStore) {
    throw new Error('Missing Root component');
  }
  return fetchRscStore;
};

export const Root = ({
  initialRscPath,
  initialRscParams,
  unstable_fetchRscStore = defaultFetchRscStore,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  unstable_fetchRscStore?: Unstable_FetchRscStore | undefined;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    unstable_fetchRsc(
      initialRscPath || '',
      initialRscParams,
      () => unstable_fetchRscStore,
    ),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    unstable_fetchRscStore[SET_ELEMENTS] = setElements;
  }, [unstable_fetchRscStore]);
  const refetch = useCallback(
    async (
      rscPath: string,
      rscParams?: unknown,
      unstable_enhanceFetchRscStore: (
        s: Unstable_FetchRscStore,
      ) => Unstable_FetchRscStore = (s) => s,
    ) => {
      // clear cache entry before fetching
      // eslint-disable-next-line react-hooks/immutability
      delete unstable_fetchRscStore[ENTRY]; // use non-enhanced store
      const data = unstable_fetchRsc(rscPath, rscParams, () =>
        unstable_enhanceFetchRscStore(unstable_fetchRscStore),
      );
      const dataWithoutErrors = Promise.resolve(data).catch(() => ({}));
      setElements((prev) => mergeElementsPromise(prev, dataWithoutErrors));
      return data;
    },
    [unstable_fetchRscStore],
  );
  return (
    <FetchRscStoreContext value={unstable_fetchRscStore}>
      <RefetchContext value={refetch}>
        <ElementsContext value={elements}>
          {DEFAULT_HTML_HEAD}
          {children}
        </ElementsContext>
      </RefetchContext>
    </FetchRscStoreContext>
  );
};

export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext);

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
  <FetchRscStoreContext value={{}}>
    <RefetchContext value={async () => ({})}>
      <ElementsContext value={elementsPromise}>
        {DEFAULT_HTML_HEAD}
        {children}
      </ElementsContext>
    </RefetchContext>
  </FetchRscStoreContext>
);
