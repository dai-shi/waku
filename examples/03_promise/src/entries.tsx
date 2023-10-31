import { lazy } from "react";
import { defineEntries } from "waku/server";
import { Children } from "waku/client";

const App = lazy(() => import("./components/App.js"));

export default defineEntries(
  // renderEntries
  async (input, ssr) => {
    if (ssr) {
      switch (input) {
        case "/":
          return {
            _ssr: (
              <App name="Waku">
                <h3>A client element</h3>
              </App>
            ),
          };
        default:
          return null;
      }
    }
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
);
