import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Root, Slot } from 'waku/minimal/client';

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App">
        <span data-testid="client-child">client child</span>
      </Slot>
    </Root>
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
