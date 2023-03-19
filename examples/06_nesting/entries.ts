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

export const prefethcer: Prefetcher = async (path) => {
  switch (path) {
    case "/":
      return [
        ["App", { name: "Wakuwork" }],
        ["InnerApp", { count: 0 }],
      ];
    default:
      return [];
  }
};
