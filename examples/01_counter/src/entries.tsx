import { lazy } from "react";

import { defineEntries } from "waku/server";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        entries: [["Waku"]],
      },
    };
  },
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return {
          input: "Waku",
          filter: (elements) => elements.App,
        };
      default:
        return null;
    }
  },
);
