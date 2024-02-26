/** @type {import('vite').UserConfig} */
export default {
  optimizeDeps: {
    include: ['react-tweet'],
  },
  ssr: {
    external: ['use-sync-external-store'],
    noExternal: ['react-tweet'],
  },
};
