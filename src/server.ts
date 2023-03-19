import type { FunctionComponent } from "react";

export type GetEntry = (
  id: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

export type Prefetcher = (
  path: string
) => Promise<Iterable<readonly [id: string, props: unknown]>>;

export type Prerenderer = () => Promise<
  Iterable<readonly [id: string, props: unknown]>
>;
