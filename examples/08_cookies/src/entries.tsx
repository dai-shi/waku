import { lazy } from "react";
import { defineEntries, getContext } from "waku/server";
import { Slot } from "waku/client";

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
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return {
          input: "",
          unstable_render: () => <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
