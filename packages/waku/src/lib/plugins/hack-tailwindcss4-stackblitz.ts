import type { Plugin } from 'vite';

const isStackBlitz =
  typeof process !== 'undefined' && 'webcontainer' in (process.versions || {});

export function hackTailwindcss4Stackblitz(): Plugin {
  return {
    name: 'hack-tailwindcss4-wasm',
    config() {
      if (isStackBlitz) {
        return {
          css: {
            postcss: {
              // FIXME we should only disable tailwindcss4
              plugins: [],
            },
          },
        };
      }
    },
    transformIndexHtml() {
      if (isStackBlitz) {
        return [
          {
            tag: 'script',
            attrs: { src: 'https://unpkg.com/@tailwindcss/browser@4' },
            injectTo: 'head',
          },
        ];
      }
    },
  };
}
