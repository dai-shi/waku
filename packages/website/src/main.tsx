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
  try {
    if ((globalThis as any).__WAKU_SSR_ENABLED__) {
      hydrateRoot(document.body, rootElement);
    } else {
      createRoot(document.body).render(rootElement);
    }
  } catch (e) {
    console.log('retrying as an error is caught: ' + e);
    setTimeout(init);
  }
}
init();
