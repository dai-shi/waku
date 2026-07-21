import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App.js';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'rsc') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
    if (input.type === 'http' && input.pathname === '/') {
      return renderHtml(
        await renderRsc({ App: <App name="Waku" /> }),
        <Slot id="App" />,
        {
          rscPath: '',
        },
      );
    }
  },
  handleBuild: async () => {},
});
