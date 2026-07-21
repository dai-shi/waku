import adapter from 'waku/adapters/default';
import App from './components/App.js';

export default adapter({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'rsc') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
  },
  handleBuild: async () => {},
});
