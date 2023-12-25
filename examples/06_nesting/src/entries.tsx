import { lazy } from 'react';
import type { ReactNode } from 'react';
import { defineEntries } from 'waku/server';

const App = lazy(() => import('./components/App.js'));
const InnerApp = lazy(() => import('./components/InnerApp.js'));

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
  ],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          input: '',
          unstable_render: ({ createElement, Slot }) =>
            createElement(Slot, { id: 'App' }),
        };
      default:
        return null;
    }
  },
);
