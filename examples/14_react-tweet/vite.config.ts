/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => ({
  ...(mode === 'development' && {
    optimizeDeps: {
      include: [
        'react-dom/client',
        'react-tweet > use-sync-external-store/shim/index.js',
        'react-tweet > date-fns/format/index.js',
      ],
    },
    ssr: {
      noExternal: ['react-tweet'],
    },
  }),
});
