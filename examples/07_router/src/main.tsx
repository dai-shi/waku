import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

import { ErrorBoundary } from './components/ErrorBoundary.js';

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router shouldSkip={() => true} />
    </ErrorBoundary>
  </StrictMode>
);

if ((globalThis as any).__WAKU_SSR_ENABLED__) {
  hydrateRoot(document.getElementById('root')!, rootElement);
} else {
  createRoot(document.getElementById('root')!).render(rootElement);
}
