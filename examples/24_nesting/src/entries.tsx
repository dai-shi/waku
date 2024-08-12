import type { ReactNode } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import App from './components/App';
import InnerApp from './components/InnerApp';
import AppWithoutSsr from './components/AppWithoutSsr';

export default defineEntries(
  // renderEntries
  async (input) => {
    const params = new URLSearchParams(input || 'App=Waku&InnerApp=0');
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
        { input: '' },
        { input: 'InnerApp=1', skipPrefetch: true },
        { input: 'InnerApp=2', skipPrefetch: true },
        { input: 'InnerApp=3', skipPrefetch: true },
        { input: 'InnerApp=4', skipPrefetch: true },
        { input: 'InnerApp=5', skipPrefetch: true },
      ],
    },
    {
      pathname: '/no-ssr',
      entries: [{ input: 'AppWithoutSsr' }],
      isStatic: true,
    },
  ],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          input: '',
          html: <Slot id="App" />,
        };
      case '/no-ssr':
        return null;
      default:
        return null;
    }
  },
);
