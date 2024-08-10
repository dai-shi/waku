/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        exclude: ['ai/rsc'],
      },
      // ssr: {
      //   optimizeDeps: {
      //     exclude: ['ai/rsc'],
      //   },
      // },
    };
  }
  return {};
};
