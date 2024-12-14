import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import Layout from './components/layout';
import App from './components/app';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
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
  getBuildConfig: async () => [{ pathSpec: [], entries: [{ rscPath: '' }] }],
});
