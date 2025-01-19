import { unstable_defineEntries as defineEntries } from "waku/minimal/server";

import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/start/server";
import { getRouterManifest } from "@tanstack/start/router-manifest";

import { createRouter } from "./router";

const handler = createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler);

console.log(handler);

export default defineEntries({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === "function") {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
  },
  handleBuild: () => null,
});
