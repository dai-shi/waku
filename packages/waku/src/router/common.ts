import type { ReactNode } from "react";

export type RouteProps = {
  path: string;
  search: string;
};

export type LinkProps = {
  href: string;
  children: ReactNode;
  pending?: ReactNode;
  notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
};

export function getComponentIds(pathname: string): readonly string[] {
  const pathItems = pathname.split("/").filter(Boolean);
  const componentIds: string[] = [];
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [
      ...pathItems.slice(0, index),
      ...(index === 0 || index < pathItems.length ? ["index"] : []),
    ].join("/");
    componentIds.push(id);
  }
  return componentIds;
}

export function getInputObject(
  pathname: string,
  search: string,
  cached?: Record<string, RouteProps>,
) {
  const componentIds = getComponentIds(pathname);
  const routes: [string, RouteProps][] = [];
  for (let index = 0; index < componentIds.length; ++index) {
    const props: RouteProps = { path: pathname, search };
    routes.push([componentIds[index]!, props]);
  }
  return { routes, cached };
}
