import type { FunctionComponent } from "react";

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

// For run-time optimization (plus, for build-time optimization with `paths`)
export type Prefetcher = (path: string) => Promise<{
  entryItems?: Iterable<readonly [rscId: string, props: unknown]>;
  clientModules?: Iterable<unknown>;
}>;

// For build-time optimization
export type Prerenderer = () => Promise<{
  entryItems?: Iterable<readonly [rscId: string, props: unknown]>;
  paths?: Iterable<string>;
  customCode?: (path: string) => string;
}>;
