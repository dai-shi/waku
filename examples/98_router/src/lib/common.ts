import type { ReactNode } from "react";

// Reference:
// - https://github.com/TanStack/router/blob/ce37222e9492bfc8e12a33a5cb2fa8c55c793b72/examples/react/quickstart/src/main.tsx

// Not implemented:
// - Outlet
// - Nested routes

export class Route {
  parentRoute: Route | null;
  path: string;
  component: (props: { children?: ReactNode }) => JSX.Element;
  constructor(config: {
    getParentRoute: () => Route;
    path: string;
    component: (props: { children?: ReactNode }) => JSX.Element;
  }) {
    this.parentRoute = config.getParentRoute();
    this.path = config.path;
    this.component = config.component;
  }
}

export interface RouteTree {
  root: Route;
  children: readonly Route[];
}

export class RootRoute extends Route {
  constructor(config: {
    component: (props: { children?: ReactNode }) => JSX.Element;
  }) {
    super({
      getParentRoute: () => null as any,
      path: "/",
      ...config,
    });
  }

  addChildren(routes: readonly Route[]): RouteTree {
    return {
      root: this,
      children: routes,
    };
  }
}
