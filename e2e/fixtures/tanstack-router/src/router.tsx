'use client';

import {
  ClientOnly,
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <p data-testid="tanstack-devtools-type">
        {typeof TanStackRouterDevtools}
      </p>
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1 data-testid="tanstack-page">TanStack home</h1>,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => <h1 data-testid="tanstack-page">TanStack about</h1>,
});

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function ClientRouter() {
  return (
    <ClientOnly>
      <RouterProvider router={router} />
    </ClientOnly>
  );
}
