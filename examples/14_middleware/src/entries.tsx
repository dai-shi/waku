import { lazy } from 'react';
import { defineEntries } from 'waku/server';
import { Slot } from 'waku/client';
//import { setServerContext } from './server-context.js';
import { ServerContextWrapper } from './components/ServerContextWrapper.js';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async function (input) {
    const ctx = this.context as { count: number };
    ++ctx.count;
    return {
      App: <ServerContextWrapper context={ctx}><App name={input || 'Waku'} count={ctx.count} /></ServerContextWrapper>

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
