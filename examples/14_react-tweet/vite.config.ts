/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: [
          'react-tweet > use-sync-external-store/shim/index.js',
          'react-tweet > date-fns/format/index.js',
        ],
      },
    };
  }
  return {};
};
