import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/client';

const pathname = window.location.pathname;

const rootElement = (
  <StrictMode>
    {pathname === '/' ? (
      <Root>
        <Slot id="App" />
      </Root>
    ) : pathname === '/no-ssr' ? (
      <Root initialInput="AppWithoutSsr">
        <Slot id="AppWithoutSsr" />
      </Root>
    ) : (
      <h1>Not Found</h1>
    )}
  </StrictMode>
);

if (document.body.dataset.hydrate) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
