import { defineConfig } from "waku/config";
import tsconfigPaths from 'vite-tsconfig-paths'

const getFallback = (id: string) => {
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
  plugins: [tsconfigPaths()],
});
