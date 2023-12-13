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
    const DO_HYDRATION = false; // FIXME a temporary workaround for hydration error
    if (DO_HYDRATION && (globalThis as any).__WAKU_SSR_ENABLED__) {
      hydrateRoot(document.getElementById('root')!, rootElement);
    } else {
      createRoot(document.getElementById('root')!).render(rootElement);
    }
  } catch (e) {
    console.log('retrying as an error is caught: ' + e);
    setTimeout(init);
  }
}
init();
