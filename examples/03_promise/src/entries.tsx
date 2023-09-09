import { lazy } from "react";

import { defineEntries } from "waku/server";
import { Children } from "waku/client";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input) => {
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
  async () => ({
    getInput: (pathStr) => {
      switch (pathStr) {
        case "/":
          return "Waku";
        default:
          return null;
      }
    },
    filter: (elements) => elements.App,
  }),
);
