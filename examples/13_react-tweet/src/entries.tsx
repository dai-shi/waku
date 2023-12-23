import { lazy } from 'react';
import { defineEntries } from 'waku/server';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App id={input} />,
    };
  },
  // getBuildConfig
  async () => [{ pathname: '/', entries: [{ input: '1734595966164935100' }] }],
  // getSsrConfig
  async ({ pathname }) => {
    switch (pathname) {
      case '/':
        return {
          input: '1734595966164935100',
          unstable_render: ({ createElement, Slot }) =>
            createElement(Slot, { id: 'App' }),
        };
      default:
        return null;
    }
  },
);
