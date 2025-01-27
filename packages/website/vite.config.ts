import tailwindcss from '@tailwindcss/vite';

/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      plugins: [tailwindcss()],
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
  return {
    plugins: [tailwindcss()],
  };
};
