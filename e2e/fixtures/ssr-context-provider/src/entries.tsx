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
  async () => [{ pathname: '/', entries: [{ input: '' }] }],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          input: '',
          body: <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
