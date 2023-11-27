import path from 'node:path';
import url from 'node:url';
import fsPromises from 'node:fs/promises';
import { lazy } from 'react';
import { defineEntries, getContext } from 'waku/server';
import { Slot } from 'waku/client';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (input) => {
    const ctx = getContext<{ count: number }>();
    ++ctx.count;
    const items = JSON.parse(
      await fsPromises.readFile(
        path.join(
          path.dirname(url.fileURLToPath(import.meta.url)),
          '../db/items.json',
        ),
        'utf8',
      ),
    );
    return {
      App: <App name={input || 'Waku'} items={items} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      '/': {
        entries: [['']],
        context: { count: 0 },
      },
    };
  },
  // getSsrConfig
  async (pathStr) => {
    switch (pathStr) {
      case '/':
        return {
          input: '',
          unstable_render: () => <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
