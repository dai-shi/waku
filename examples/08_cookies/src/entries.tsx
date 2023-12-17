import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsPromises from 'node:fs/promises';
import { lazy } from 'react';
import { defineEntries } from 'waku/server';

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
          '../db/items.json',
        ),
        'utf8',
      ),
    );
    return {
      App: <App name={input || 'Waku'} count={ctx.count} items={items} />,
    };
  },
  // getBuildConfig
  async () => [{ pathname: '/', entries: [['']], context: { count: 0 } }],
  // getSsrConfig
  async ({ pathname }) => {
    switch (pathname) {
      case '/':
        return {
          input: '',
          unstable_render: ({ createElement, Slot }) =>
            createElement(Slot, { id: 'App' }),
        };
      default:
        return null;
    }
  },
);
