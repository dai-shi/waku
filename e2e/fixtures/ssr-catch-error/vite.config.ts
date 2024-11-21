export default ({ mode }: { mode: string }) => {
  if (mode === 'development') {
    return {
      plugins: [
        {
          name: 'externalize-react-error-boundary',
          configResolved(config: any) {
            // TODO HACK temporary solution until v0.22.0
            if (
              config.cacheDir.endsWith(
                'node_modules/.vite/waku-dev-server-main',
              )
            ) {
              config.ssr.noExternal = ['react-error-boundary'];
            }
          },
        },
      ],
    };
  }
  return {};
};
