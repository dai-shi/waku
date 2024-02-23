import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsPromises from 'node:fs/promises';
import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async function (input) {
    const ctx = this.context as { count: number };
    ++ctx.count;
    const items = JSON.parse(
      await fsPromises.readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '../private/items.json',
        ),
        'utf8',
      ),
    );
    return {
      App: <App name={input || 'Waku'} count={ctx.count} items={items} />,
    };
  },
  // getBuildConfig
  async () => [
    { pathname: '/', entries: [{ input: '' }], context: { count: 0 } },
  ],
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
