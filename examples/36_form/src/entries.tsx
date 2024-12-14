import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';
import { runWithRerender } from './als';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const elements: Record<string, unknown> = {};
      const rerender = (rscPath: string) => {
        elements.App = <App name={rscPath || 'Waku'} />;
      };
      const value = await runWithRerender(rerender, () =>
        input.fn(...input.args),
      );
      return renderRsc({ ...elements, _value: value });
    }
    if (
      (input.type === 'action' || input.type === 'custom') &&
      input.pathname === '/'
    ) {
      const actionResult =
        input.type === 'action' ? await input.fn() : undefined;
      return renderHtml(
        { App: <App name="Waku" /> },
        <Slot id="App" />,
        '',
        actionResult,
      );
    }
  },
  getBuildConfig: async () => [{ pathSpec: [], entries: [{ rscPath: '' }] }],
});
