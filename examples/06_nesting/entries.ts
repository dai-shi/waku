import { defineEntries } from "waku/server";

export default defineEntries(
  // getEntry
  async (id) => {
    switch (id) {
      case "App":
        return import("./src/App.js");
      case "InnerApp":
        return import("./src/InnerApp.js");
      default:
        return null;
    }
  },
  // getBuilder
  async () => {
    return {
      "/": {
        elements: [
          ["App", { name: "Waku" }],
          ["InnerApp", { count: 0 }],
          ["InnerApp", { count: 1 }, true],
          ["InnerApp", { count: 2 }, true],
          ["InnerApp", { count: 3 }, true],
          ["InnerApp", { count: 4 }, true],
          ["InnerApp", { count: 5 }, true],
        ],
      },
    };
  }
);
