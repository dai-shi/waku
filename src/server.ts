import type { FunctionComponent } from "react";

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent } | null>;

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

export function defineEntries(getEntry: GetEntry, getBuilder?: GetBuilder) {
  return { getEntry, getBuilder };
}
