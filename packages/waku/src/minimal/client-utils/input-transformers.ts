export type FetchRscInputTransformer = (
  rscPath: string,
  rscParams: unknown,
) => readonly [rscPath: string, rscParams: unknown];

// Intentionally absent from the package "exports" map, so it stays private to
// consumers while tests can still import it to reset state.
//
// TODO: delete this module once unstable_registerFetchRscInputTransformer is
// dropped.
export const fetchRscInputTransformers = new Set<FetchRscInputTransformer>();
