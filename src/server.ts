import type { Writable } from "node:stream";
import { AsyncLocalStorage } from "node:async_hooks";
import { createElement } from "react";
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

export type RenderOptions<Context> = {
  command: "dev" | "build" | "start";
  ctx?: Context;
  moduleIdCallback?: (id: string) => void;
};

export type GetBuildConfig = (
  unstable_renderRSC: (
    input: RenderInput,
    options: Omit<RenderOptions<never>, "command">
  ) => Promise<PipeableStream>
) => Promise<{
  [pathStr: string]: {
    elements?: Iterable<
      readonly [rscId: string, props: unknown, skipPrefetch?: boolean]
    >;
    customCode?: string; // optional code to inject
    ctx?: unknown;
    skipSsr?: boolean;
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

// For internal use only
export function ClientFallback() {
  return createElement("div", { className: "spinner" });
}

// For internal use only
export function ClientOnly() {
  throw new Error("Client-only component");
}

const ContextStore = new AsyncLocalStorage();
// FIXME this is not what we want
(globalThis as any).WAKU_SERVER_CONTEXT_STORE ||= ContextStore;

export function getContext<T>() {
  const ContextStore: AsyncLocalStorage<unknown> = (globalThis as any)
    .WAKU_SERVER_CONTEXT_STORE;
  const ctx = ContextStore.getStore();
  if (ctx === undefined) {
    throw new Error("Missing runWithContext");
  }
  return ctx as T;
}

// For internal use only
export function runWithContext<Context, Result>(
  ctx: Context,
  fn: () => Result
): Result {
  const ContextStore: AsyncLocalStorage<unknown> = (globalThis as any)
    .WAKU_SERVER_CONTEXT_STORE;
  return ContextStore.run(ctx, fn);
}
