import { AsyncLocalStorage } from 'node:async_hooks';
import fsPromises from 'node:fs/promises';
import * as cookie from 'cookie';
import { contextStorage, getContext } from 'hono/context-storage';
import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App';

const cookieStorage = new AsyncLocalStorage<{ count: number }>();

export const getCount = () => cookieStorage.getStore()?.count ?? 0;

export default adapter(
  {
    handleRequest: async (input, { renderRsc, renderHtml }) => {
      const cookies = cookie.parse(input.req.headers.get('cookie') || '');
      const count = (Number(cookies.count) || 0) + 1;
      const setCookie = cookie.serialize('count', String(count));
      return cookieStorage.run({ count }, async () => {
        const items = JSON.parse(
          await fsPromises.readFile('./private/items.json', 'utf8'),
        );
        if (input.type === 'component') {
          const stream = await renderRsc({
            App: <App name={input.rscPath || 'Waku'} items={items} />,
          });
          return new Response(stream, {
            headers: { 'set-cookie': setCookie },
          });
        }
        if (input.type === 'custom' && input.pathname === '/') {
          const response = await renderHtml(
            await renderRsc({ App: <App name={'Waku'} items={items} /> }),
            <Slot id="App" />,
            { rscPath: '' },
          );
          response.headers.append('set-cookie', setCookie);
          return response;
        }
      });
    },
    handleBuild: async () => {},
  },
  {
    middlewareFns: [contextStorage],
    middlewareModules: import.meta.glob('./middleware/*.ts'),
  },
);

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
