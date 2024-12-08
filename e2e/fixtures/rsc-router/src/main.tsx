import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

createRoot(document as any).render(rootElement);
