import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Root, Slot } from 'waku/minimal/client';

let rscPath = '';
let slotId = 'App';
if (window.location.pathname === '/test') {
  rscPath = 'test';
  slotId = 'TestApp';
}
if (window.location.pathname === '/mixed-forms') {
  rscPath = 'mixed-forms';
  slotId = 'MixedForms';
}

const rootElement = (
  <StrictMode>
    <Root initialRscPath={rscPath}>
      <Slot id={slotId} />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
