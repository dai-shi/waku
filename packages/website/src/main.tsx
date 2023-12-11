import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router shouldSkip={() => true} />
  </StrictMode>
);

// FIXME temporary fix, doesn't feel ideal.
function init() {
  const root = document.getElementById('root');
  if (!root) {
    setTimeout(init);
    return;
  }
  if ((globalThis as any).__WAKU_SSR_ENABLED__) {
    hydrateRoot(root, rootElement);
  } else {
    createRoot(root).render(rootElement);
  }
}
init();
