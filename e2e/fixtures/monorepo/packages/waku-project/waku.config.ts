// @ts-expect-error types not present
import tailwindcss from '@tailwindcss/vite'; // eslint-disable-line import/no-unresolved
import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [tailwindcss()],
    }),
  },
});
