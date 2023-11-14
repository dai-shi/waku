import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router shouldSkip={() => true} />
  </StrictMode>
);

if ((globalThis as any).__WAKU_SSR_ENABLED__) {
  hydrateRoot(document.getElementById('root')!, rootElement);
} else {
  createRoot(document.getElementById('root')!).render(rootElement);
}
