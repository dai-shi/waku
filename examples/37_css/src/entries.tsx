import { new_defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import Layout from './components/layout';
import App from './components/app';

export default new_defineEntries({
  unstable_handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <Layout>
            <App name={input.rscPath || 'Waku'} />
          </Layout>
        ),
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        {
          App: (
            <Layout>
              <App name={'Waku'} />
            </Layout>
          ),
        },
        <Slot id="App" />,
        '',
      );
    }
  },
  unstable_getBuildConfig: async () => [
    { pathSpec: [], entries: [{ rscPath: '' }] },
  ],
});
