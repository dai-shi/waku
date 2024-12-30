import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylex } from 'vite-plugin-stylex-dev';

// FIXME we would like to avoid this hack
const hackCssPluginNeededForStylex = () => {
  return {
    name: 'hack-css-plugin-needed-for-stylex',
    apply: 'serve' as const,
    resolveId(id: string) {
      if (id.endsWith('.css') && !id.endsWith('.vanilla.css')) {
        return id;
      }
    },
  };
};

const vanillaExtractPluginInstance = vanillaExtractPlugin();

// FIXME we would like this to waku.config.ts using unstable_viteConfigs.
export default defineConfig({
  plugins: [
    hackCssPluginNeededForStylex(),
    vanillaExtractPluginInstance,
    stylex(),
  ],
});
