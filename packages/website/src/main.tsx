import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

// FIXME temporary fix, doesn't feel ideal.
function init() {
  try {
    createRoot(document.body).render(rootElement);
  } catch (e) {
    console.log('retrying as an error is caught: ' + e);
    setTimeout(init);
  }
}
init();
