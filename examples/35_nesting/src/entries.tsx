import type { ReactNode } from 'react';
import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';
import InnerApp from './components/InnerApp';
import AppWithoutSsr from './components/AppWithoutSsr';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      const params = new URLSearchParams(
        input.rscPath || 'App=Waku&InnerApp=0',
      );
      const result: Record<string, ReactNode> = {};
      if (params.has('App')) {
        result.App = <App name={params.get('App')!} />;
      }
      if (params.has('InnerApp')) {
        result.InnerApp = <InnerApp count={Number(params.get('InnerApp'))} />;
      }
      if (params.has('AppWithoutSsr')) {
        result.AppWithoutSsr = <AppWithoutSsr />;
      }
      return renderRsc(result);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name="Waku" />, InnerApp: <InnerApp count={0} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    unstable_generatePrefetchCode,
  }) => ({
    [Symbol.asyncIterator]: () => {
      const moduleIds = new Set<string>();
      const generateHtmlHead = () =>
        `<script type="module" async>${unstable_generatePrefetchCode(
          [''],
          moduleIds,
        )}</script>`;
      const tasks = [
        async () => ({
          type: 'htmlHead' as const,
          pathSpec: [],
          head: generateHtmlHead(),
        }),
        async () => ({
          type: 'file' as const,
          pathname: rscPath2pathname('AppWithoutSsr'),
          body: await renderRsc(
            { App: <App name="AppWithoutSsr" /> },
            { moduleIdCallback: (id) => moduleIds.add(id) },
          ),
        }),
        async () => ({
          type: 'file' as const,
          pathname: '/no-ssr',
          body: (
            await renderHtml(
              { App: <App name="AppWithSsr" /> },
              <Slot id="App" />,
              {
                rscPath: 'AppWithoutSsr',
                htmlHead: generateHtmlHead(),
              },
            )
          ).body,
        }),
      ];
      return {
        next: async () => {
          const task = tasks.shift();
          if (task) {
            return { value: await task() };
          }
          return { done: true, value: undefined };
        },
      };
    },
  }),
});
