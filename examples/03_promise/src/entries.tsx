import { lazy } from "react";
import { defineEntries } from "waku/server";
import { Children, Slot } from "waku/client";

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
          unstable_render: () => (
            <Slot id="App">
              <h3>A client element</h3>
            </Slot>
          ),
        };
      default:
        return null;
    }
  },
);
