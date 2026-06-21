import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import * as cookie from 'cookie';
import { contextStorage } from 'hono/context-storage';
import adapter from 'waku/adapters/default';
import { Children, Slot } from 'waku/minimal/client';
import { DynamicIsland } from './components/DynamicIsland';
// eslint-disable-next-line import/no-unresolved
import { App } from '@/components/App';

const cookieStorage = new AsyncLocalStorage<{
  count: number;
  itemCount: number;
}>();

export const getCookieCount = () => cookieStorage.getStore()?.count ?? 0;
export const getItemCount = () => cookieStorage.getStore()?.itemCount ?? 0;

const modeFromPathname = (
  pathname: string,
): 'basic' | 'children' | 'islands' | 'jotai' | 'cookie' => {
  if (pathname === '/children') {
    return 'children';
  }
  if (pathname === '/islands') {
    return 'islands';
  }
  if (pathname === '/jotai') {
    return 'jotai';
  }
  if (pathname === '/cookie') {
    return 'cookie';
  }
  return 'basic';
};

const appForMode = (
  mode: ReturnType<typeof modeFromPathname>,
  name = 'Waku',
  rscParams?: unknown,
) => (
  <App name={name} mode={mode} rscParams={rscParams}>
    {mode === 'children' ? <Children /> : null}
  </App>
);

export default adapter(
  {
    handleRequest: async (input, { renderRsc, renderHtml }) => {
      if (input.type === 'component') {
        if (input.rscPath === 'island') {
          return renderRsc({
            'slice:dynamic': (
              <DynamicIsland>
                <Children />
              </DynamicIsland>
            ),
          });
        }
        const mode = modeFromPathname(`/${input.rscPath}`);
        return renderRsc({
          App: appForMode(mode, input.rscPath || 'Waku', input.rscParams),
        });
      }
      if (input.type === 'custom' && input.pathname === '/api/hello') {
        return new Response('world');
      }
      if (input.type === 'custom') {
        const mode = modeFromPathname(input.pathname);
        const cookies = cookie.parse(input.req.headers.get('cookie') || '');
        const count = (Number(cookies.count) || 0) + 1;
        const items = JSON.parse(
          await fs.readFile('./private/items.json', 'utf8'),
        ) as unknown[];
        return cookieStorage.run(
          { count, itemCount: items.length },
          async () => {
            const html = await renderHtml(
              await renderRsc({ App: appForMode(mode) }),
              <Slot id="App">
                {mode === 'children' ? (
                  <span data-testid="client-child">client child</span>
                ) : null}
              </Slot>,
              { rscPath: mode === 'basic' ? '' : mode },
            );
            if (mode === 'cookie') {
              html.headers.append(
                'set-cookie',
                cookie.serialize('count', `${count}`),
              );
            }
            return html;
          },
        );
      }
    },
    handleBuild: async ({ generateDefaultHtml }) => {
      await generateDefaultHtml('index.html');
    },
  },
  {
    middlewareFns: [contextStorage],
    middlewareModules: import.meta.glob('./middleware/*.ts'),
  },
);
