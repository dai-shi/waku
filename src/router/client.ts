/// <reference types="react/next" />

"use client";

import {
  cache,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useTransition,
  Fragment,
} from "react";

import { serve } from "../client.js";
import type { RouteProps, ChildProps, LinkProps } from "./common.js";

type ChangeLocation = (
  pathname?: string,
  search?: string,
  replace?: boolean
) => void;

// FIXME we should separate this into three isolated contexts
const RouterContext = createContext<{
  location: ReturnType<typeof parseLocation>;
  changeLocation: ChangeLocation;
  basePath: string;
} | null>(null);

export function useChangeLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    const dummyFn: ChangeLocation = () => {
      throw new Error("Missing Router");
    };
    return dummyFn;
  }
  return value.changeLocation;
}

export function useLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("Missing Router");
  }
  return value.location;
}

const useBasePath = () => {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("Missing Router");
  }
  return value.basePath;
};

// FIXME normalizing `search` before prefetch might be good.
// FIXME selective `search` would be better. (for intermediate routes too)

const prefetchRoutes = (pathname: string, search: string, basePath: string) => {
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const pathItems = pathname.split("/").filter(Boolean);
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    const props: RouteProps =
      index < pathItems.length ? { childIndex: index + 1 } : { search };
    // FIXME we blindly expect JSON.stringify usage is deterministic
    const serializedProps = JSON.stringify(props);
    if (!prefetched[rscId]) {
      prefetched[rscId] = {};
    }
    const searchParams = new URLSearchParams();
    searchParams.set("props", serializedProps);
    if (!prefetched[rscId][serializedProps]) {
      prefetched[rscId][serializedProps] = fetch(
        `${basePath}${rscId}/${searchParams}`
      );
    }
    (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(pathname, search);
  }
};

const getRoute = cache((rscId: string) => serve<RouteProps>(rscId));

export function Child({ index }: ChildProps) {
  const { pathname, search } = useLocation();
  const pathItems = pathname.split("/").filter(Boolean);
  if (index > pathItems.length) {
    throw new Error("invalid index");
  }
  const rscId = pathItems.slice(0, index).join("/") || "index";
  return createElement(
    getRoute(rscId),
    index < pathItems.length
      ? {
          childIndex: index + 1, // we still have a child route
        }
      : {
          search, // attach `search` only for a leaf route for now
        }
  );
}

export function Link({
  href,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
}: LinkProps) {
  const changeLocation = useChangeLocation();
  const basePath = useBasePath();
  const [isPending, startTransition] = useTransition();
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    const url = new URL(href, window.location.href);
    if (url.href !== window.location.href) {
      startTransition(() => {
        changeLocation(url.pathname, url.search);
      });
    }
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? () => {
        const url = new URL(href, window.location.href);
        if (url.href !== window.location.href) {
          prefetchRoutes(url.pathname, url.search, basePath);
        }
      }
    : undefined;
  const ele = createElement("a", { href, onClick, onMouseEnter }, children);
  if (isPending && pending !== undefined) {
    return createElement(Fragment, null, ele, pending);
  }
  if (!isPending && notPending !== undefined) {
    return createElement(Fragment, null, ele, notPending);
  }
  return ele;
}

const parseLocation = () => {
  const { pathname, search } = window.location;
  return { pathname, search };
};

export function Router({ basePath = "/RSC/" }: { basePath?: string }) {
  const [location, setLocation] = useState(parseLocation);

  const changeLocation: ChangeLocation = (pathname, search, replace) => {
    const url = new URL(window.location.href);
    if (pathname) {
      url.pathname = pathname;
    }
    if (search) {
      url.search = search;
    }
    if (replace) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }
    setLocation(parseLocation()); // is it too costly?
  };

  useEffect(() => {
    const callback = () => setLocation(parseLocation());
    window.addEventListener("popstate", callback);
    return () => window.removeEventListener("popstate", callback);
  }, []);

  prefetchRoutes(location.pathname, location.search, basePath);

  return createElement(
    RouterContext.Provider,
    { value: { location, changeLocation, basePath } },
    createElement(Child, { index: 0 })
  );
}

// This is a trick to trigger fallback identified by the name.
export const Waku_SSR_Capable_Link = Link;
