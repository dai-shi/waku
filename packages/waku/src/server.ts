import type { Writable } from "node:stream";
import { AsyncLocalStorage } from "node:async_hooks";
import { createElement } from "react";
import type { ReactNode } from "react";

type PipeableStream = { pipe<T extends Writable>(destination: T): T };

type Elements = Record<string, ReactNode>;

export type RenderEntries = (input: string) => Promise<Elements | null>;

export type RenderInput =
  | {
      input: string;
    }
  | {
      actionId: string;
      args: unknown[];
    };

export type RenderOptions = {
  command: "dev" | "build" | "start";
  ssr: boolean;
  context: unknown;
  moduleIdCallback?: (id: string) => void;
};

export type GetBuildConfig = (
  unstable_renderRSC: (
    input: RenderInput,
    options: Omit<RenderOptions, "command" | "context">,
  ) => Promise<PipeableStream>,
) => Promise<{
  [pathStr: string]: {
    entries?: Iterable<readonly [input: string, skipPrefetch?: boolean]>;
    customCode?: string; // optional code to inject
    context?: unknown;
    skipSsr?: boolean;
  };
}>;

export type GetSsrConfig = () => {
  getInput: (pathStr: string) => Promise<string | null>;
  filter: (elements: Elements) => ReactNode;
};

export function defineEntries(
  renderEntries: RenderEntries,
  getBuildConfig?: GetBuildConfig,
  getSsrConfig?: GetSsrConfig,
) {
  return { renderEntries, getBuildConfig, getSsrConfig };
}

// For internal use only
export function ClientFallback() {
  return createElement("div", { className: "spinner" });
}

// For internal use only
export function ClientOnly() {
  throw new Error("Client-only component");
}

type Store = {
  getContext: () => unknown;
  rerender: (input: string) => void;
};

const asl = new AsyncLocalStorage<Store>();
// FIXME this is not what we want
(globalThis as any).WAKU_SERVER_ASYNC_LOCAL_STORAGE ||= asl;

export function getContext<T = unknown>() {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  const store = asl.getStore();
  if (store === undefined) {
    throw new Error("Missing runWithAsyncLocalStorage");
  }
  return store.getContext() as T;
}

export function rerender(input: string) {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  const store = asl.getStore();
  if (store === undefined) {
    throw new Error("Missing runWithAsyncLocalStorage");
  }
  return store.rerender(input);
}

// For internal use only
export function runWithAsyncLocalStorage<Result>(
  store: Store,
  fn: () => Result,
): Result {
  const asl: AsyncLocalStorage<Store> = (globalThis as any)
    .WAKU_SERVER_ASYNC_LOCAL_STORAGE;
  return asl.run(store, fn);
}
