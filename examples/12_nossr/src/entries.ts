/// <reference types="vite/client" />

import { new_defineEntries } from 'waku/minimal/server';
import { fsRouter } from 'waku/router/server';

const router = fsRouter(import.meta.url, (file) =>
  import.meta.glob('./pages/**/*.tsx')[`./pages/${file}`]?.(),
);

export default new_defineEntries({
  unstable_handleRequest: async (input, utils) => {
    if (input.type === 'custom') {
      return null; // no ssr
    }
    return router.unstable_handleRequest(input, utils);
  },
  unstable_getBuildConfig: (utils) => {
    return router.unstable_getBuildConfig(utils);
  },
});
