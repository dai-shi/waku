import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

import { ErrorBoundary } from './components/ErrorBoundary.js';

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router />
    </ErrorBoundary>
  </StrictMode>
);

if (__WAKU_ENV__.SSR_ENABLED) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
