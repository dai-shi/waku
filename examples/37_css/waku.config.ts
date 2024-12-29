import { defineConfig } from 'waku/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import stylexPlugin from 'vite-plugin-stylex';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [
        {
          name: 'hack-css-plugin-needed-for-stylex-FIXME',
          resolveId(id: string) {
            if (id.endsWith('.css') && !id.endsWith('.vanilla.css')) {
              return id;
            }
          },
        },
        // FIXME why do we need "as any" here?
        vanillaExtractPlugin() as any,
        stylexPlugin(),
      ],
    }),
  },
});
