import { lazy } from "react";
import { defineEntries } from "waku/server";
import { Children } from "waku/client";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: (
        <App name={input || "Waku"}>
          <Children />
        </App>
      ),
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
  // renderPage
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return {
          element: <App name="Waku" ssr />,
        };
      default:
        return null;
    }
  },
);
