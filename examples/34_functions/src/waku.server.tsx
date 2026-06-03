import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import { runWithRequest, runWithRerender } from './als';
import App from './components2/App';

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithRequest(input.req, async () => {
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
        return renderRsc(elements, { value });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        return renderHtml(
          await renderRsc({ App: <App name="Waku" /> }),
          <Slot id="App" />,
          {
            rscPath: '',
          },
        );
      }
    }),
  handleBuild: async () => {},
});
