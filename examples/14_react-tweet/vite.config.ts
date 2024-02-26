/** @type {import('vite').UserConfig} */
export default {
  optimizeDeps: {
    include: ['react-tweet'],
  },
  ssr: {
    noExternal: ['react-tweet'],
  }
};
