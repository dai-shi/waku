import type { GetEntry } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.tsx");
    default:
      throw new Error(`Unknown entry id: ${id}`);
  }
};
