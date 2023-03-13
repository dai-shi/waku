import type { GetEntry } from "wakuwork";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App");
    default:
      throw new Error(`Unknown entry id: ${id}`);
  }
};
