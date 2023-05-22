import type { GetEntry, GetBuilder } from "wakuwork/server";

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

export const getBuilder: GetBuilder = async () => {
  return {
    "/": {
      elements: [
        ["App", { name: "Wakuwork" }],
        ["InnerApp", { count: 0 }],
        ["InnerApp", { count: 1 }, true],
        ["InnerApp", { count: 2 }, true],
        ["InnerApp", { count: 3 }, true],
        ["InnerApp", { count: 4 }, true],
        ["InnerApp", { count: 5 }, true],
      ],
    },
  };
};
