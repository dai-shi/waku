import { lazy } from 'react';
import { defineEntries } from 'waku/server';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input || 'Waku'} />,
    };
  },
  // getBuildConfig
  async () => [{ pathname: '/', entries: [{ input: '' }] }],
  // getSsrConfig
  () => {
    throw new Error('SSR is should not be used in this test.');
  },
);
