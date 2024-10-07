import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import App from './components/app';

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
