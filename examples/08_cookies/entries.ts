import { defineEntries, getContext } from "waku/server";

export default defineEntries(
  // getEntry
  async (id) => {
    const ctx = getContext<{ count: number }>();
    ++ctx.count;
    switch (id) {
      case "App":
        return import("./src/App.js");
      default:
        return null;
    }
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        elements: [["App", { name: "Waku" }]],
      },
    };
  },
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case "/":
        return { element: ["App", { name: "Waku" }] };
      default:
        return null;
    }
  }
);
