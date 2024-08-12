import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/client';

const rootElement = (
  <StrictMode>
    <Root>
      <html>
        <head></head>
        <body>
          <Slot id="App" />
        </body>
      </html>
    </Root>
  </StrictMode>
);

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
