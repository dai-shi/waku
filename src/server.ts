import type { FunctionComponent } from "react";

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent } | null>;

export type GetBuilder = (
  unstable_resolveClientEntry: (filePath: string) => string
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
