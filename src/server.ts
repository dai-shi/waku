import type { Writable } from "node:stream";
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

export type RenderOptions = {
  command: "dev" | "build" | "start";
  moduleIdCallback?: (id: string) => void;
};

export type GetBuildConfig = (
  root: string,
  unstable_renderRSC: (
    input: RenderInput,
    options: Omit<RenderOptions, "command">
  ) => Promise<PipeableStream>
) => Promise<{
  [pathStr: string]: {
    elements?: Iterable<
      readonly [rscId: string, props: unknown, skipPrefetch?: boolean]
    >;
    customCode?: string; // optional code to inject
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
