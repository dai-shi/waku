import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router
      initialRoute={{ path: '/', query: '', hash: '' }}
      unstable_routeInterceptor={() => false}
    />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
