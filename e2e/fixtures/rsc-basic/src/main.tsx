import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

createRoot(document as any).render(rootElement);
