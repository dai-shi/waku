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

export type GetSsrConfig = (pathStr: string) => Promise<{
  element: [rscId: string, props: unknown];
} | null>;

export function defineEntries(
  getEntry: GetEntry,
  getBuilder?: GetBuilder,
  getSsrConfig?: GetSsrConfig
) {
  return { getEntry, getBuilder, getSsrConfig };
}

export function ClientOnly() {
  throw new Error("Client only component found. Please wrap with Suspense.");
}
