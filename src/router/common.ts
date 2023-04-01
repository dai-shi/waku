import type { ReactNode } from "react";

export type RouteProps = {
  index: number;
  search: string;
};

export type ChildProps = {
  index: number;
};

export type LinkProps = {
  href: string;
  children: ReactNode;
  pending?: ReactNode;
  notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
};

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

export const WAKUWORK_ROUTER = "wakuwork/router";

export const childReference = Object.defineProperties({} as any, {
  $$typeof: { value: CLIENT_REFERENCE },
  $$id: { value: WAKUWORK_ROUTER + "#Child" },
  $$async: { value: false },
});

export const linkReference = Object.defineProperties({} as any, {
  $$typeof: { value: CLIENT_REFERENCE },
  $$id: { value: WAKUWORK_ROUTER + "#Link" },
  $$async: { value: false },
});
