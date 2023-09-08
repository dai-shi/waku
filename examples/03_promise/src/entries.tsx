import { lazy } from "react";

import { defineEntries } from "waku/server";
import { Children } from "waku/client";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input, options) => {
    if (options.ssr) {
      return {
        _ssr: <App name={input}>...</App>,
      };
    }
    return {
      App: (
        <App name={input}>
          <Children />
        </App>
      ),
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
        return { input: "Waku" };
      default:
        return null;
    }
  },
);
