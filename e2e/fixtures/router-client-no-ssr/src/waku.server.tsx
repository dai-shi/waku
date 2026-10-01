import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(import.meta.glob('./pages/**/*.tsx'));

export default adapter({
  handleRequest: async (input, utils) => {
    if (input.type === 'http') {
      return 'fallback';
    }
    return router.handleRequest(input, utils);
  },
  handleBuild: (utils) => router.handleBuild(utils),
});
