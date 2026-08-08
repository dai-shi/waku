import { StrictMode, useEffect, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const ClientRouter = () => {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const global = globalThis as typeof globalThis & {
      __WAKU_TEST_ROUTER_KEY__?: number;
      __WAKU_TEST_REMOUNT_ROUTER__?: () => void;
    };
    global.__WAKU_TEST_ROUTER_KEY__ = key;
    global.__WAKU_TEST_REMOUNT_ROUTER__ = () => setKey((prev) => prev + 1);
    return () => {
      delete global.__WAKU_TEST_ROUTER_KEY__;
      delete global.__WAKU_TEST_REMOUNT_ROUTER__;
    };
  }, [key]);
  return <Router key={key} />;
};

const rootElement = (
  <StrictMode>
    <ClientRouter />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
