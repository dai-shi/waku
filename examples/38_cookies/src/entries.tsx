import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsPromises from 'node:fs/promises';
import {
  defineEntries,
  unstable_getCustomContext as getCustomContext,
} from 'waku/server';
import { Slot } from 'waku/client';

import App from './components/App';

export default defineEntries(
  // renderEntries
  async (rscPath) => {
    const context = getCustomContext<{ count: number }>();
    ++context.count;
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
      App: <App name={rscPath || 'Waku'} items={items} />,
    };
  },
  // getBuildConfig
  async () => [
    { pathname: '/', entries: [{ rscPath: '' }], context: { count: 0 } },
  ],
  // getSsrConfig
  async (pathname) => {
    switch (pathname) {
      case '/':
        return {
          rscPath: '',
          html: <Slot id="App" />,
        };
      default:
        return null;
    }
  },
);
