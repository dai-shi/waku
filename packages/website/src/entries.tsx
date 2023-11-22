import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

const App = lazy(() => import('./components/app.js'));

export default defineEntries(
  // renderEntries
  async () => {
    return {
      App: <App />,
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
          unstable_render: () => <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
