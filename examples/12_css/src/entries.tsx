import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

import Layout from './components/layout';
import App from './components/app';

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: (
        <Layout>
          <App name={input || 'Waku'} />
        </Layout>
      ),
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
          html: <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
