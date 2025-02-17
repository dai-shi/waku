import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './components/App';

const rootElement = (
  <StrictMode>
    <App name="Client" />
  </StrictMode>
);

createRoot(document as any).render(rootElement);
