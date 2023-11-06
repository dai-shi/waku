import { lazy } from "react";
import { defineEntries } from "waku/server";
import { Children, ServerSlot } from "waku/client";

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
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return {
          input: "",
          filter: (elements) => (
            <ServerSlot node={elements.App}>
              <h3>A client element</h3>
            </ServerSlot>
          ),
        };
      default:
        return null;
    }
  },
);
