export const ENTRY = 'e';
export const SET_ELEMENTS = 's';
export const FETCH_ENHANCERS = 'f';
export const FETCH_RSC_INPUT_TRANSFORMERS = 't';
export const CALL_SERVER_ELEMENTS_LISTENERS = 'l';

export type SetElements = (
  updater: (
    prev: Promise<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>,
) => void;

export type FetchEnhancer = (fetchFn: typeof fetch) => typeof fetch;
type FetchEnhancers = Set<FetchEnhancer>;

export type FetchRscInputTransformer = (
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => readonly [rscPath: string, rscParams: unknown, prefetchOnly: boolean];
type FetchRscInputTransformers = Set<FetchRscInputTransformer>;

type CallServerElementsListeners = Set<
  (elements: Record<string, unknown>) => void
>;

export type FetchRscStore = {
  [ENTRY]?: [
    rscPath: string,
    rscParams: unknown,
    elementsPromise: Promise<Record<string, unknown>>,
  ];
  [SET_ELEMENTS]?: SetElements;
  [FETCH_ENHANCERS]?: FetchEnhancers;
  [FETCH_RSC_INPUT_TRANSFORMERS]?: FetchRscInputTransformers;
  [CALL_SERVER_ELEMENTS_LISTENERS]?: CallServerElementsListeners;
};

// Internal module-level RSC store. This module is intentionally absent from the
// package "exports" map, so it stays private to consumers while tests can still
// import it to reset state.
export const fetchRscStore: FetchRscStore = {};
