import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [tailwindcss()],
    }),
  },
});
