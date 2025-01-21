import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';

const rootElement = (
  <StrictMode>
    <App />
  </StrictMode>
);

createRoot(document as any).render(rootElement);
