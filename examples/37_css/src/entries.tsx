import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import Layout from './components/layout';
import App from './components/app';

export default defineEntries(
  // renderEntries
  async (rscPath) => {
    return {
      App: (
        <Layout>
          <App name={rscPath || 'Waku'} />
        </Layout>
      ),
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
