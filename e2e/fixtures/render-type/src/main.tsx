import { StrictMode, Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router, ErrorBoundary } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <ErrorBoundary>
      <Suspense>
        <Router />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
