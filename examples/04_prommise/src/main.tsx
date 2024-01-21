import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/client';

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App">
        <h3>A client element</h3>
      </Slot>
    </Root>
  </StrictMode>
);

if (import.meta.env.WAKU_HYDRATE) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
