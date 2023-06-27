import url from "node:url";
import path from "node:path";
import { defineConfig } from "waku/config";

export const getFallback = (id: string) => {
  if (id.endsWith("#Counter")) {
    return "waku/server#ClientOnly";
  }
  return "waku/server#ClientFallback";
};

export default defineConfig({
  framework: {
    ssr: {
      getFallback,
    },
  },
});
