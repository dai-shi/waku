/// <reference types="react/next" />

import {
  cache,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
} from "react";

import { serve } from "../client.js";
import { WAKUWORK_ROUTER } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";

type ChangeLocation = (
  pathname?: string,
  search?: string,
  replace?: boolean
) => void;

const RouterContext = createContext<{
  location: ReturnType<typeof parseLocation>;
  changeLocation: ChangeLocation;
} | null>(null);

export function useChangeLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("Missing Router");
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

// TODO normalizing `search` before prefetch would be necessary
// TODO ommitting `search` items would be important for caching

const prefetchRoutes = (pathname: string, search: string) => {
  const prefetched = ((globalThis as any).__WAKUWORK_PREFETCHED__ ||= {});
  const pathItems = pathname.split("/").filter(Boolean);
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    const props = {
      pathname,
      index,
      search,
    };
    // FIXME we blindly expect JSON.stringify usage is deterministic
    const serializedProps = JSON.stringify(props);
    if (!prefetched[rscId]) {
      prefetched[rscId] = {};
    }
    const searchParams = new URLSearchParams();
    searchParams.set("props", serializedProps);
    if (!prefetched[rscId][serializedProps]) {
      prefetched[rscId][serializedProps] = fetch(
        `/RSC/${rscId}?${searchParams}`
      );
    }
  }
};

const getRoute = cache((rscId: string) => serve<RouteProps>(rscId));

const ChildrenWrapper = ({ pathname, index, search }: RouteProps) => {
  const pathItems = pathname.split("/").filter(Boolean);
  const rscId = pathItems.slice(0, index).join("/") || "index";
  return createElement(getRoute(rscId), { pathname, index, search });
};

export const Link = ({ href, children }: LinkProps) => {
  const changeLocation = useChangeLocation();
  return createElement(
    "a",
    {
      href,
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        const url = new URL(href, window.location.href);
        if (url.href !== window.location.href) {
          changeLocation(url.pathname, url.search);
        }
      },
    },
    children
  );
};

const moduleCache = ((globalThis as any).__webpack_require__wakuwork_cache ||=
  new Map());
moduleCache.set(WAKUWORK_ROUTER, {
  ChildrenWrapper,
  Link,
});

const parseLocation = () => {
  const { pathname, search } = window.location;
  return { pathname, search };
};

export function Router() {
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

  prefetchRoutes(location.pathname, location.search);

  const children = createElement(ChildrenWrapper, {
    pathname: location.pathname,
    index: 0,
    search: location.search,
  });

  return createElement(
    RouterContext.Provider,
    { value: { location, changeLocation } },
    children
  );
}
