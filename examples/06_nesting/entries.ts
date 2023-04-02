import type { GetEntry, Prefetcher, Prerenderer } from "wakuwork/server";

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

export const prerenderer: Prerenderer = async () => {
  return {
    entryItems: [
      ["App", { name: "Wakuwork" }],
      ["InnerApp", { count: 0 }],
      ["InnerApp", { count: 1 }],
      ["InnerApp", { count: 2 }],
      ["InnerApp", { count: 3 }],
      ["InnerApp", { count: 4 }],
      ["InnerApp", { count: 5 }],
    ],
    paths: ["/"],
  };
};
