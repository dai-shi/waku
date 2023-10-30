import { lazy } from "react";
import type { ReactNode } from "react";

import { defineEntries } from "waku/server";

const App = lazy(() => import("./components/App.js"));
const InnerApp = lazy(() => import("./components/InnerApp.js"));

const AppSkeleton = lazy(async () => ({
  default: (await import("./components/App.js")).AppSkeleton,
}));
const InnerAppSkeleton = lazy(async () => ({
  default: (await import("./components/InnerApp.js")).InnerAppSkeleton,
}));
const CounterSkeleton = lazy(async () => ({
  default: (await import("./components/Counter.js")).CounterSkeleton,
}));

export default defineEntries(
  // renderEntries
  async (input) => {
    const params = new URLSearchParams(input || "App=Waku&InnerApp=0");
    const result: Record<string, ReactNode> = {};
    if (params.has("App")) {
      result.App = <App name={params.get("App")!} />;
    }
    if (params.has("InnerApp")) {
      result.InnerApp = <InnerApp count={Number(params.get("InnerApp"))} />;
    }
    return result;
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        entries: [
          [""],
          ["InnerApp=1", true],
          ["InnerApp=2", true],
          ["InnerApp=3", true],
          ["InnerApp=4", true],
          ["InnerApp=5", true],
        ],
      },
    };
  },
  // renderPage
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return {
          element: (
            <AppSkeleton name="Waku">
              <CounterSkeleton>
                <InnerAppSkeleton count={0}>
                  <CounterSkeleton />
                </InnerAppSkeleton>
              </CounterSkeleton>
            </AppSkeleton>
          ),
        };
      default:
        return null;
    }
  },
);
