import { setServerCallback } from '@vitejs/plugin-rsc/browser';
// Layering rule: src/lib must not import src modules outside src/lib.
// Exception: bootstrap must share Minimal's action runtime.
import { unstable_callServerRsc } from '../../minimal/client-runtime.js';
setServerCallback(unstable_callServerRsc);

if (import.meta.hot) {
  import.meta.hot.on('rsc:update', (e) => {
    console.log('[rsc:update]', e);
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((l) => l());
  });
}

import 'virtual:vite-rsc-waku/client-entry';
