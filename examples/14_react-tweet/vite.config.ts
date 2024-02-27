/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => ({
  ...(mode === 'development' && {
    optimizeDeps: {
      include: ['react-tweet'],
    },
    ssr: {
      external: ['use-sync-external-store'],
      noExternal: ['react-tweet'],
    },
  }),
});
