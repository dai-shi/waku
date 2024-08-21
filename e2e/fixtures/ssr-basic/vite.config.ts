export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        exclude: ['ai/rsc'],
      },
    };
  }
  return {};
};
