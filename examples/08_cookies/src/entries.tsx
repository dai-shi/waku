import { lazy } from "react";

import { defineEntries, getContext } from "waku/server";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input) => {
    const ctx = getContext<{ count: number }>();
    ++ctx.count;
    return {
      App: <App name={input || "Waku"} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        entries: [[""]],
        context: { count: 0 },
      },
    };
  },
  // getSsrConfig
  // Passing cookies through SSR server isn't supported (yet).
  // async () => ({
  //   getInput: (pathStr) => {
  //     switch (pathStr) {
  //       case "/":
  //         return "";
  //       default:
  //         return null;
  //     }
  //   },
  //   filter: (elements) => elements.App,
  // }),
);
