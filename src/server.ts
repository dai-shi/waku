import type { Writable } from "node:stream";
import type { FunctionComponent } from "react";

type PipeableStream = { pipe<T extends Writable>(destination: T): T };

export type GetEntry = (
  rscId: string
) => Promise<FunctionComponent | { default: FunctionComponent } | null>;

export type RenderInput =
  | {
      rscId: string;
      props: unknown;
    }
  | {
      rsfId: string;
      args: unknown[];
      rscId: string;
      props: unknown;
    }
  | {
      rsfId: string;
      args: unknown[];
    };

export type GetBuilder = (
  root: string,
  unstable_renderRSC: (
    input: RenderInput,
    clientModuleCallback: (id: string) => void
  ) => Promise<PipeableStream>
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
