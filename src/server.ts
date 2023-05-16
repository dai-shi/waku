import type { FunctionComponent } from "react";

// TODO revisit entries API
// - prefer export default?
// - return null from getEntry for 404, instead of throwing

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent }>;

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
