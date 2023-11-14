import { lazy } from 'react';
import type { ReactNode } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

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
  async () => {
    return {
      '/': {
        entries: [
          [''],
          ['InnerApp=1', true],
          ['InnerApp=2', true],
          ['InnerApp=3', true],
          ['InnerApp=4', true],
          ['InnerApp=5', true],
        ],
      },
    };
  },
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case '/':
        return {
          input: '',
          unstable_render: () => <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
