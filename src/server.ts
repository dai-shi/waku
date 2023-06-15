import type { Writable } from "node:stream";
import { AsyncLocalStorage } from "node:async_hooks";
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

export type GetBuildConfig = (
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
  getBuildConfig?: GetBuildConfig,
  getSsrConfig?: GetSsrConfig
) {
  return { getEntry, getBuildConfig, getSsrConfig };
}

const rscContext = new AsyncLocalStorage<{
  isSsr: boolean;
}>();

// For internal use only
export function runWithRscContext<Result>(
  ctx: NonNullable<ReturnType<typeof rscContext.getStore>>,
  fn: () => Result
) {
  return rscContext.run(ctx, fn);
}

export function isSsr() {
  const ctx = rscContext.getStore();
  if (!ctx) {
    throw new Error("Missing runWithRscContext");
  }
  return ctx.isSsr;
}

// For internal use only
export function Empty() {
  return null;
}
