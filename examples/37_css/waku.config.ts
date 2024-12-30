import { defineConfig } from 'waku/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylex } from 'vite-plugin-stylex-dev';

// FIXME we would like to avoid this hack
const hackCssPluginNeededForStylex = () => {
  let mode = '';
  return {
    name: 'hack-css-plugin-needed-for-stylex',
    configResolved(config: { mode: string }) {
      mode = config.mode;
    },
    resolveId(id: string) {
      if (
        mode === 'development' &&
        id.endsWith('.css') &&
        !id.endsWith('.vanilla.css')
      ) {
        return id;
      }
    },
  };
};

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [
        hackCssPluginNeededForStylex(),
        vanillaExtractPlugin(),
        stylex(),
      ],
    }),
  },
});
