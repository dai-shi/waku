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
