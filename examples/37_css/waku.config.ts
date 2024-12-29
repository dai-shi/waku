import { defineConfig } from 'waku/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylex } from 'vite-plugin-stylex-dev';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [
        {
          name: 'hack-css-plugin-needed-for-stylex-dev-FIXME',
          resolveId(id: string) {
            if (id.endsWith('.css') && !id.endsWith('.vanilla.css')) {
              return id;
            }
          },
        },
        vanillaExtractPlugin(),
        stylex(),
      ],
    }),
  },
});
