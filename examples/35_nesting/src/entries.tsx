import type { ReactNode } from 'react';
import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';
import InnerApp from './components/InnerApp';
import AppWithoutSsr from './components/AppWithoutSsr';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      const params = new URLSearchParams(
        input.rscPath || 'App=Waku&InnerApp=0',
      );
      const result: Record<string, ReactNode> = {};
      if (params.has('App')) {
        result.App = <App name={params.get('App')!} />;
      }
      if (params.has('InnerApp')) {
        result.InnerApp = <InnerApp count={Number(params.get('InnerApp'))} />;
      }
      if (params.has('AppWithoutSsr')) {
        result.AppWithoutSsr = <AppWithoutSsr />;
      }
      return renderRsc(result);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name="Waku" />, InnerApp: <InnerApp count={0} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  getBuildConfig: async () => [
    {
      pathSpec: [],
      entries: [
        { rscPath: '' },
        { rscPath: 'InnerApp=1', skipPrefetch: true },
        { rscPath: 'InnerApp=2', skipPrefetch: true },
        { rscPath: 'InnerApp=3', skipPrefetch: true },
        { rscPath: 'InnerApp=4', skipPrefetch: true },
        { rscPath: 'InnerApp=5', skipPrefetch: true },
      ],
    },
    {
      pathSpec: [{ type: 'literal', name: '/no-ssr' }],
      entries: [{ rscPath: 'AppWithoutSsr' }],
      isStatic: true,
    },
  ],
});
