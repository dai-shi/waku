import { lazy } from "react";
import { defineEntries } from "waku/server";

const App = lazy(() => import("./components/app.js"));

export default defineEntries(
  async () => {
    return {
      App: <App />,
    };
  },
  async () => {
    return {
      "/": {
        entries: [[""]],
      },
    };
  },
  () => ({
    getInput: async (pathStr) => {
      switch (pathStr) {
        case "/":
          return "";
        default:
          return null;
      }
    },
    filter: (elements) => elements.App,
  }),
);
