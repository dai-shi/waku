import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Children, Slot } from 'waku/client';

const App = lazy(() => import('./components/App'));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: (
        <App name={input || 'Waku'}>
          <Children />
        </App>
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
