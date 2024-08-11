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
          html: (
            <html>
              <head></head>
              <body>
                <Slot id="App" />
              </body>
            </html>
          ),
        };
      default:
        return null;
    }
  },
);
