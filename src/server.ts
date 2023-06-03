import type { Writable } from "node:stream";
import type { FunctionComponent } from "react";

type PipeableStream = { pipe<T extends Writable>(destination: T): T };

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent } | null>;

export type GetBuilder = (
  root: string,
  unstable_renderForBuild: (
    element: unknown,
    clientModuleCallback: (id: string) => void
  ) => PipeableStream
) => Promise<{
  [pathStr: string]: {
    elements?: Iterable<
      readonly [rscId: string, props: unknown, skipPrefetch?: boolean]
    >;
    customCode?: string; // optional code to inject
  };
}>;

export function defineEntries(getEntry: GetEntry, getBuilder?: GetBuilder) {
  return { getEntry, getBuilder };
}
