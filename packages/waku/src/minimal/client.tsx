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
  type INTERNAL_PrefetchedEntry,
  createPrefetchedEntry,
  getPrefetchedClose,
  getPrefetchedDebugId,
  getPrefetchedResponse,
  getPrefetchedRscParams,
  getPrefetchedRscPath,
  getPrefetchedTemporaryReferences,
} from '../lib/utils/prefetch.js';
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

const getClientPrefetchedEntries = (): INTERNAL_PrefetchedEntry[] =>
  ((globalThis as any).__WAKU_PREFETCHED__ ||= []);

const consumeInitialPrefetchedEntry = () => {
  const initialRsc = (globalThis as any).__WAKU_INITIAL_RSC__ as
    | INTERNAL_PrefetchedEntry
    | undefined;
  if (initialRsc) {
    delete (globalThis as any).__WAKU_INITIAL_RSC__;
    return initialRsc;
  }
  return undefined;
};

const consumeClientPrefetchedEntry = (
  prefetchedEntries: INTERNAL_PrefetchedEntry[],
  rscPath: string,
  rscParams: unknown,
) => {
  const index = prefetchedEntries.findIndex(
    (entry) =>
      getPrefetchedRscPath(entry) === rscPath &&
      // rscParams is intentionally compared by reference.
      getPrefetchedRscParams(entry) === rscParams,
  );
  return index >= 0 ? prefetchedEntries.splice(index, 1)[0] : undefined;
};

const fetchRscInternal: FetchRscInternal = (
  fetchRscStore: Unstable_FetchRscStore,
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => {
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
  const baseFetchFn = fetchRscStore[FETCH_FN] || fetch;
  const prefetchedEntries = getClientPrefetchedEntries();
  const prefetchedEntry = !prefetchOnly
    ? consumeClientPrefetchedEntry(prefetchedEntries, rscPath, rscParams) ||
      consumeInitialPrefetchedEntry()
    : undefined;
  const debug =
    import.meta.hot && !prefetchOnly
      ? setupDebugChannel(
          baseFetchFn,
          !!prefetchedEntry,
          prefetchedEntry ? getPrefetchedDebugId(prefetchedEntry) : undefined,
        )
      : undefined;
  const fetchFn = debug?.fetchFn || baseFetchFn;
  const temporaryReferences =
    (prefetchedEntry &&
      getPrefetchedTemporaryReferences<
        ReturnType<typeof createTemporaryReferenceSet>
      >(prefetchedEntry)) ||
    createTemporaryReferenceSet();
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  const responsePromise = prefetchedEntry
    ? getPrefetchedResponse(prefetchedEntry)
    : rscParams === undefined
      ? fetchFn(url)
      : rscParams instanceof URLSearchParams
        ? fetchFn(url + '?' + rscParams)
        : encodeReply(rscParams, { temporaryReferences }).then((body) =>
            fetchFn(url, { method: 'POST', body }),
          );
  if (prefetchOnly) {
    prefetchedEntries.push(
      createPrefetchedEntry(
        rscPath,
        responsePromise,
        rscParams,
        temporaryReferences,
      ),
    );
    return undefined as never;
  }
  const elements = createFromFetch<Elements>(checkStatus(responsePromise), {
    callServer: (funcId: string, args: unknown[]) =>
      unstable_callServerRsc(funcId, args, () => fetchRscStore),
    debugChannel: debug?.debugChannel,
    temporaryReferences,
  });
  if (import.meta.env?.WAKU_BUILD_ID) {
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
  }
  const closeFn = prefetchedEntry && getPrefetchedClose(prefetchedEntry);
  if (closeFn) {
    waitForRootPrerequisites(elements).then(closeFn, closeFn);
  }
  return elements;
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
  const prefetched = getClientPrefetchedEntries();
  const prefetchedEntry = prefetched.find(
    (entry) =>
      getPrefetchedRscPath(entry) === rscPath &&
      // rscParams is intentionally compared by reference.
      getPrefetchedRscParams(entry) === rscParams,
  );
  if (prefetchedEntry) {
    return; // already prefetched
  }
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
