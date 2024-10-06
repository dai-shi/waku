/// <reference types="vite/client" />

import { fsRouter } from 'waku/router/server';

export default {
  ...fsRouter(import.meta.url, (file) =>
    import.meta.glob('./pages/**/*.tsx')[`./pages/${file}`]?.(),
  ),
  getSsrConfig: undefined,
};
