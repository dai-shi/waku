import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Children, Slot } from 'waku/minimal/client';

import App from './components/App';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <App name={input.rscPath || 'Waku'}>
            <Children />
          </App>
        ),
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        {
          App: (
            <App name="Waku">
              <Children />
            </App>
          ),
        },
        <Slot id="App">
          <h3>A client element</h3>
        </Slot>,
        '',
      );
    }
  },
  getBuildConfig: async () => [{ pathSpec: [], entries: [{ rscPath: '' }] }],
});
