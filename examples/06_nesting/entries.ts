import type { GetEntry, Prerenderer } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.tsx");
    case "InnerApp":
      return import("./src/InnerApp.tsx");
    default:
      throw new Error(`Unknown entry id: ${id}`);
  }
};

export const prerenderer: Prerenderer = async (path) => {
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
