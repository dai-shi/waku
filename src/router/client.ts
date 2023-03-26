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
  searchParams?: URLSearchParams,
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

const getRoute = cache((rscId: string) => serve<RouteProps>(rscId));

const ChildrenWrapper = ({ pathname, index, searchParams }: RouteProps) => {
  const pathItems = pathname.split("/").filter(Boolean);
  const subPathname = pathItems.slice(0, index).join("/");
  return createElement(getRoute(subPathname || "index"), {
    pathname,
    index,
    searchParams,
  });
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
        changeLocation(url.pathname, new URLSearchParams(url.search));
      },
    },
    children
  );
};

if (!(globalThis as any).__webpack_require__wakuwork_cache) {
  (globalThis as any).__webpack_require__wakuwork_cache = new Map();
}
(globalThis as any).__webpack_require__wakuwork_cache.set(WAKUWORK_ROUTER, {
  ChildrenWrapper,
  Link,
});

const parseLocation = () => {
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("rsc_id") || searchParams.has("rsf_id")) {
    throw new Error(
      "rsc_id and rsf_id are currently reserved by wakuwork. This is not a finalized API"
    );
  }
  return { pathname, searchParams };
};

export function Router() {
  const [location, setLocation] = useState(parseLocation);

  const changeLocation: ChangeLocation = (pathname, searchParams, replace) => {
    const url = new URL(window.location.href);
    if (pathname) {
      url.pathname = pathname;
    }
    if (searchParams) {
      url.search = searchParams.toString();
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

  const children = createElement(ChildrenWrapper, {
    pathname: location.pathname,
    index: 0,
    searchParams: location.searchParams.toString(),
  });

  return createElement(
    RouterContext.Provider,
    {
      value: { location, changeLocation },
    },
    children
  );
}
