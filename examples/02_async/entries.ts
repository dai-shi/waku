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
  // getSsrConfig
  // FIXME SSR streaming and RSC streaming conflict. Let's revisit it later.
  // async (pathStr) => {
  //   switch (pathStr) {
  //     case "/":
  //       return { element: ["App", { name: "Waku" }] };
  //     default:
  //       return null;
  //   }
  // }
);
