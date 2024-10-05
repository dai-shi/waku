/// <reference types="react/experimental" />

import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import App from './components/app.js';

export default defineEntries(
  // renderEntries
  async () => {
    return {
      App: <App />,
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
