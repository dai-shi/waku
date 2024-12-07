import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewRouter } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <NewRouter />
  </StrictMode>
);

createRoot(document as any).render(rootElement);
