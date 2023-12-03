import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Children } from 'waku/client';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: (
        <App name={input || 'Waku'}>
          <Children />
        </App>
      ),
    };
  },
  // getBuildConfig
  async () => {
    return {
      '/': {
        entries: [['']],
      },
    };
  },
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case '/':
        return {
          input: '',
          unstable_render: ({ createElement, Slot }) =>
            createElement(
              Slot,
              { id: 'App' },
              createElement('h3', null, 'A client element'),
            ),
        };
      default:
        return null;
    }
  },
);
