import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
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

createRoot(document as any).render(rootElement);
