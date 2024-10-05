import { lazy } from 'react';
import { defineEntries } from 'waku/server';

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
  () => {
    throw new Error('SSR should not be used in this test.');
  },
);
