import type { FunctionComponent } from "react";

// TODO revisit entries API (prefer export default ...?)

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
    elements?: Iterable<readonly [rscId: string, props: unknown]>;
    customModules?: Iterable<string>; // for ignored dynamic imports
    unstable_customCode?: string;
  };
}>;
