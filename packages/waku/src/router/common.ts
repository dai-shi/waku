import type { ReactNode } from "react";

export type RouteProps = { childIndex: number } | { search: string };

export type ChildProps = { index: number };

export type LinkProps = {
  href: string;
  children: ReactNode;
  pending?: ReactNode;
  notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
};
