import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';
import type { Unstable_RouteProps as RouteProps } from 'waku/router/client-core';

const routeInterceptor = (route: RouteProps) => {
  const interceptor = new URL(window.location.href).searchParams.get(
    '__interceptor',
  );
  if (interceptor === 'block') {
    return false;
  }
  if (interceptor === 'rewrite') {
    return { path: '/intercepted', query: 'from=interceptor', hash: '' };
  }
  return route;
};

const rootElement = (
  <StrictMode>
    <Router unstable_routeInterceptor={routeInterceptor} />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document.body, rootElement, defaultRootOptions);
} else {
  createRoot(document.body, defaultRootOptions).render(rootElement);
}
