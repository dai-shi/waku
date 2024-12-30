import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/minimal/client';

const pathname = window.location.pathname;

const rootElement = (
  <StrictMode>
    {pathname === '/' ? (
      <Root>
        <Slot id="App" />
      </Root>
    ) : pathname === '/no-ssr' ? (
      <Root initialRscPath="AppWithoutSsr">
        <Slot id="AppWithoutSsr" />
      </Root>
    ) : (
      <h1>Not Found</h1>
    )}
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
