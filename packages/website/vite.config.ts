/** @type {import('vite').UserConfig} */
export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: ['tailwindcss/colors'],
      },
      ssr: {
        optimizeDeps: {
          include: [
            'next-mdx-remote/rsc',
            'react-server-dom-webpack/client.edge', // FIXME this should be managed by dev-server-impl.ts
          ],
        },
      },
    };
  }
  return {};
};
