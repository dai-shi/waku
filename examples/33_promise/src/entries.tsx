import { defineEntries } from 'waku/server';
import { Children, Slot } from 'waku/client';
import App from './components/App';

export default defineEntries(
  // renderEntries
  async (rscPath) => {
    return {
      App: (
        <App name={rscPath || 'Waku'}>
          <Children />
        </App>
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
          html: (
            <Slot id="App">
              <h3>A client element</h3>
            </Slot>
          ),
        };
      default:
        return null;
    }
  },
);
