/// <reference types="react/canary" />

"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  Fragment,
} from "react";
import type { ComponentProps, FunctionComponent, ReactNode } from "react";

import { Root, Slot, useRefetch } from "../client.js";
import { getComponentIds, getInputObject } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";

const parseLocation = () => {
  const { pathname, search } = window.location;
  return { pathname, search };
};

const LocationContext = createContext<ReturnType<typeof parseLocation> | null>(
  null,
);

type ChangeLocation = (
  pathname?: string,
  search?: string,
  replace?: boolean,
) => void;

type PrefetchLocation = (pathname: string, search: string) => void;

const ActionContext = createContext<{
  changeLocation: ChangeLocation;
  prefetchLocation: PrefetchLocation;
} | null>(null);

export function useChangeLocation() {
  const action = useContext(ActionContext);
  if (!action) {
    return () => {
      throw new Error("Missing Router");
    };
  }
  return action.changeLocation;
}

export function useLocation() {
  const loc = useContext(LocationContext);
  if (!loc) {
    throw new Error("Missing Router");
  }
  return loc;
}

export function Link({
  href,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
}: LinkProps) {
  const action = useContext(ActionContext);
  const changeLocation = action
    ? action.changeLocation
    : () => {
        throw new Error("Missing Router");
      };
  const prefetchLocation = action
    ? action.prefetchLocation
    : () => {
        throw new Error("Missing Router");
      };
  const [isPending, startTransition] = useTransition();
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    const url = new URL(href, window.location.href);
    if (url.href !== window.location.href) {
      prefetchLocation(url.pathname, url.search);
      startTransition(() => {
        changeLocation(url.pathname, url.search);
      });
    }
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? () => {
        const url = new URL(href, window.location.href);
        if (url.href !== window.location.href) {
          prefetchLocation(url.pathname, url.search);
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

function InnerRouter({
  setLoc,
  cached,
  setCached,
  basePath,
  children,
}: {
  setLoc: (loc: ReturnType<typeof parseLocation>) => void;
  cached: Record<string, RouteProps>;
  setCached: (
    fn: (prev: Record<string, RouteProps>) => Record<string, RouteProps>,
  ) => void;
  basePath: string;
  children: ReactNode;
}) {
  const refetch = useRefetch();

  const action: {
    changeLocation: ChangeLocation;
    prefetchLocation: PrefetchLocation;
  } = useMemo(() => {
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
      const loc = parseLocation();
      setLoc(loc);
      const input = JSON.stringify(
        getInputObject(loc.pathname, loc.search, cached),
      );
      refetch(input);
      const componentIds = getComponentIds(loc.pathname);
      const routeProps: RouteProps = {
        path: loc.pathname,
        search: loc.search,
      };
      setCached((prev) => ({
        ...prev,
        ...Object.fromEntries(componentIds.map((id) => [id, routeProps])),
      }));
    };
    const prefetchLocation: PrefetchLocation = (pathname, search) => {
      const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
      const input = JSON.stringify(getInputObject(pathname, search, cached));
      if (!prefetched[input]) {
        prefetched[input] = fetch(basePath + encodeURIComponent(input));
      }
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(pathname, search);
    };
    return { changeLocation, prefetchLocation };
  }, [setLoc]);

  const { changeLocation, prefetchLocation } = action;
  useEffect(() => {
    const callback = () => {
      const loc = parseLocation();
      prefetchLocation(loc.pathname, loc.search);
      changeLocation(loc.pathname, loc.search);
    };
    window.addEventListener("popstate", callback);
    return () => window.removeEventListener("popstate", callback);
  }, []);

  return createElement(ActionContext.Provider, { value: action }, children);
}

export function Router({ basePath = "/RSC/" }: { basePath?: string }) {
  const [loc, setLoc] = useState(parseLocation);

  const initialInput = JSON.stringify(getInputObject(loc.pathname, loc.search));
  const componentIds = getComponentIds(loc.pathname);
  const [cached, setCached] = useState<Record<string, RouteProps>>(() => {
    const routeProps: RouteProps = {
      path: loc.pathname,
      search: loc.search,
    };
    return Object.fromEntries(componentIds.map((id) => [id, routeProps]));
  });

  const children = componentIds.reduceRight(
    (acc: ReactNode, id) =>
      createElement(
        Slot as FunctionComponent<
          Omit<ComponentProps<typeof Slot>, "children">
        >,
        { id },
        acc,
      ),
    null,
  );

  return createElement(
    LocationContext.Provider,
    { value: loc },
    createElement(
      Root as FunctionComponent<Omit<ComponentProps<typeof Root>, "children">>,
      { initialInput, basePath },
      createElement(
        InnerRouter as FunctionComponent<
          Omit<ComponentProps<typeof InnerRouter>, "children">
        >,
        { setLoc, cached, setCached, basePath },
        children,
      ),
    ),
  );
}

// This is a trick to trigger fallback identified by the name.
export const Waku_SSR_Capable_Link = Link;
