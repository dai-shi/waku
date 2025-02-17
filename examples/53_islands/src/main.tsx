import { StrictMode, useEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot, useRefetch } from 'waku/minimal/client';

const DynamicFether = () => {
  const refetch = useRefetch();
  useEffect(() => {
    refetch('dynamic');
  }, [refetch]);
  return null;
};

const rootElement = (
  <StrictMode>
    <Root>
      <DynamicFether />
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
