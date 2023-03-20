import type { FunctionComponent } from "react";

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

export type Prefetcher = (
  path: string
) => Promise<Iterable<readonly [rscId: string, props: unknown]>>;

export type Prerenderer = () => Promise<
  Iterable<readonly [rscId: string, props: unknown]>
>;
