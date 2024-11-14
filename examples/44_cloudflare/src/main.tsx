import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/minimal/client';

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
