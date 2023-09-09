import { lazy } from "react";

import { defineEntries, getContext } from "waku/server";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input, options) => {
    if (options.ssr) {
      return {
        _ssr: <App name={input} />,
      };
    }
    const ctx = getContext<{ count: number }>();
    ++ctx.count;
    return {
      App: <App name={input} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        entries: [["Waku"]],
        context: { count: 0 },
      },
    };
  },
  // getSsrConfig
  // Passing cookies through SSR server isn't supported (yet).
  // async (pathStr) => {
  //   switch (pathStr) {
  //     case "/":
  //       return { input: "Waku" };
  //     default:
  //       return null;
  //   }
  // },
);
