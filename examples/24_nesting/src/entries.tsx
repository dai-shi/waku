import type { ReactNode } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import App from './components/App';
import InnerApp from './components/InnerApp';
import AppWithoutSsr from './components/AppWithoutSsr';

export default defineEntries(
  // renderEntries
  async (rscPath) => {
    const params = new URLSearchParams(rscPath || 'App=Waku&InnerApp=0');
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
    return result;
  },
  // getBuildConfig
  async () => [
    {
      pathname: '/',
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
      pathname: '/no-ssr',
      entries: [{ rscPath: 'AppWithoutSsr' }],
      isStatic: true,
    },
  ],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          rscPath: '',
          html: <Slot id="App" />,
        };
      case '/no-ssr':
        return null;
      default:
        return null;
    }
  },
);
