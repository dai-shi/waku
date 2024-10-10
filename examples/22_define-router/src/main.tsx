import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { NewRouter } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <NewRouter />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
