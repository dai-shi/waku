import { defineEntries } from "waku/server";

export default defineEntries(
  // getEntry
  async (id) => {
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
  }
);
