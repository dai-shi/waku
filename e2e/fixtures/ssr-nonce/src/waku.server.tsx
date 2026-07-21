import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App.js';

// Fixed nonce for testing purposes
const TEST_NONCE = 'test-nonce-12345';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'rsc') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'http' && input.pathname === '/') {
      const response = await renderHtml(
        await renderRsc({ App: <App /> }),
        <Slot id="App" />,
        {
          rscPath: '',
          nonce: TEST_NONCE,
        },
      );

      // Set CSP header with the nonce
      response.headers.set(
        'Content-Security-Policy',
        `script-src 'self' 'nonce-${TEST_NONCE}';`,
      );

      return response;
    }
  },
  handleBuild: async () => {},
});
