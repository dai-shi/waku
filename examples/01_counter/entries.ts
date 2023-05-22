import type { GetEntry, GetBuilder } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.js");
    default:
      throw new Error(`Unknown entry id: ${id}`);
  }
};

export const getBuilder: GetBuilder = async () => {
  return {
    "/": {
      elements: [["App", { name: "Wakuwork" }]],
    },
  };
};
