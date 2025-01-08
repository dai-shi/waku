import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';
import ErrorBoundary from './components/ErrorBoundary.js';

function fallbackRender({ error }: { error: unknown }) {
  return (
    <html>
      <body>
        <h1>{String(error)}</h1>
      </body>
    </html>
  );
}

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallbackRender={fallbackRender}>
      <Router />
    </ErrorBoundary>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
