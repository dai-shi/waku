import { lazy } from "react";

import { defineEntries } from "waku/server";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input, ssr) => {
    if (ssr) {
      switch (input) {
        case "/":
          return { _ssr: <App name="Waku" /> };
        default:
          return null;
      }
    }
    return {
      App: <App name={input || "Waku"} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        entries: [[""]],
      },
    };
  },
);
