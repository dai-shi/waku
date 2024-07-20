/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      ssr: {
        optimizeDeps: {
          include: ['next-mdx-remote/rsc'],
        },
      },
    };
  }
  return {};
};
