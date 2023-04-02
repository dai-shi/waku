import type { GetEntry, Prefetcher } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.js");
    case "InnerApp":
      return import("./src/InnerApp.js");
    default:
      throw new Error(`Unknown entry id: ${id}`);
  }
};

export const prefetcher: Prefetcher = async (path) => {
  switch (path) {
    case "/":
      return {
        entryItems: [
          ["App", { name: "Wakuwork" }],
          ["InnerApp", { count: 0 }],
        ],
        clientModules: [(await import("./src/Counter.js")).Counter],
      };
    default:
      return {};
  }
};
