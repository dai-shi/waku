import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const container =
  new URLSearchParams(window.location.search).get('__container') === 'body'
    ? document.body
    : document;

createRoot(container, defaultRootOptions).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
