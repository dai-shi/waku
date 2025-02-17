/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: ['tailwindcss/colors'],
      },
      ssr: {
        optimizeDeps: {
          include: ['next-mdx-remote/rsc'],
        },
      },
    };
  }
  return {};
};
