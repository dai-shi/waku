import type { FunctionComponent } from "react";

export type GetEntry = (
  id: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

export type Prerenderer = () => Promise<
  Iterable<readonly [id: string, props: unknown]>
>;
