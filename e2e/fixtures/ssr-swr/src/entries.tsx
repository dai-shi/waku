import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (rscPath) => {
    return {
      App: <App name={rscPath || 'Waku'} />,
    };
  },
  // getBuildConfig
  async () => [{ pathname: '/', entries: [{ rscPath: '' }] }],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          rscPath: '',
          html: <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
