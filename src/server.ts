import type { FunctionComponent } from "react";

// TODO revisit entries API
// - prefer export default?
// - return null from getEntry for 404, instead of throwing

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

// For run-time optimization (plus, for build-time optimization with `paths`)
// TODO remove
export type Prefetcher = (path: string) => Promise<{
  entryItems?: Iterable<readonly [rscId: string, props: unknown]>;
  clientModules?: Iterable<unknown>;
}>;

// For build-time optimization
// TODO remove
export type Prerenderer = () => Promise<{
  entryItems?: Iterable<readonly [rscId: string, props: unknown]>;
  paths?: Iterable<string>;
  unstable_customCode?: (
    path: string,
    decodeId: (encodedId: string) => [id: string, name: string]
  ) => string;
}>;

export type GetBuilder = (
  // FIXME can we somehow avoid leaking internal implementation?
  unstable_decodeId: (encodedId: string) => [id: string, name: string]
) => Promise<{
  [pathStr: string]: {
    elements?: Iterable<
      readonly [rscId: string, props: unknown, skipPrefetch?: boolean]
    >;
    customCode?: string; // optional code to inject
  };
}>;

// XXX Are there any better ways?
export type GetCustomModules = () => Promise<Iterable<string>>; // for ignored dynamic imports
