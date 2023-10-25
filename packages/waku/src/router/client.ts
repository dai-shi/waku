"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  Fragment,
} from "react";
import type { ComponentProps, FunctionComponent, ReactNode } from "react";

import { Root, Slot, useRefetch } from "../client.js";
import { getComponentIds, getInputString } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";

const parseLocation = () => {
  const { pathname, search } = window.location;
  return { pathname, search };
};

type ChangeLocation = (
  pathname?: string,
  search?: string,
  replace?: boolean,
) => void;

type PrefetchLocation = (pathname: string, search: string) => void;

const RouterContext = createContext<{
  loc: ReturnType<typeof parseLocation>;
  changeLocation: ChangeLocation;
  prefetchLocation: PrefetchLocation;
} | null>(null);

export function useChangeLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    return () => {
      throw new Error("Missing Router");
    };
  }
  return value.changeLocation;
}

export function useLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("Missing Router");
  }
  return value.loc;
}

export function Link({
  href,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
}: LinkProps) {
  const value = useContext(RouterContext);
  const changeLocation = value
    ? value.changeLocation
    : () => {
        throw new Error("Missing Router");
      };
  const prefetchLocation = value
    ? value.prefetchLocation
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

type ShouldSkip = (
  componentId: string,
  props: RouteProps,
  prevProps: RouteProps,
) => boolean;

const getSkipList = (
  componentIds: readonly string[],
  props: RouteProps,
  cached: Record<string, RouteProps>,
  shouldSkip?: ShouldSkip,
): string[] =>
  shouldSkip
    ? componentIds.filter((id) => {
        const prevProps = cached[id];
        return prevProps && shouldSkip(id, props, prevProps);
      })
    : [];

function InnerRouter({
  basePath,
  shouldSkip,
}: {
  basePath: string;
  shouldSkip?: ShouldSkip | undefined;
}) {
  const refetch = useRefetch();

  const [loc, setLoc] = useState(parseLocation);
  const componentIds = getComponentIds(loc.pathname);

  const [cached, setCached] = useState<Record<string, RouteProps>>(() => {
    const routeProps: RouteProps = {
      path: loc.pathname,
      search: loc.search,
    };
    return Object.fromEntries(componentIds.map((id) => [id, routeProps]));
  });
  const cachedRef = useRef(cached);
  useEffect(() => {
    cachedRef.current = cached;
  }, [cached]);

  const changeLocation: ChangeLocation = useCallback(
    (pathname, search, replace) => {
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
      const componentIds = getComponentIds(loc.pathname);
      const routeProps: RouteProps = {
        path: loc.pathname,
        search: loc.search,
      };
      const skip = getSkipList(
        componentIds,
        routeProps,
        cachedRef.current,
        shouldSkip,
      );
      if (skip.length === componentIds.length) {
        return; // everything is cached
      }
      const input = getInputString(loc.pathname, loc.search, skip);
      refetch(input);
      setCached((prev) => ({
        ...prev,
        ...Object.fromEntries(
          componentIds.flatMap((id) =>
            skip.includes(id) ? [] : [[id, routeProps]],
          ),
        ),
      }));
    },
    [refetch, shouldSkip],
  );

  const prefetchLocation: PrefetchLocation = useCallback(
    (pathname, search) => {
      const componentIds = getComponentIds(pathname);
      const routeProps: RouteProps = {
        path: pathname,
        search: search,
      };
      const skip = getSkipList(
        componentIds,
        routeProps,
        cachedRef.current,
        shouldSkip,
      );
      if (skip.length === componentIds.length) {
        return; // everything is cached
      }
      const input = getInputString(pathname, search, skip);
      const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
      if (!prefetched[input]) {
        prefetched[input] = fetch(basePath + input);
      }
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(pathname, search);
    },
    [basePath, shouldSkip],
  );

  useEffect(() => {
    const callback = () => {
      const loc = parseLocation();
      prefetchLocation(loc.pathname, loc.search);
      changeLocation(loc.pathname, loc.search);
    };
    window.addEventListener("popstate", callback);
    return () => window.removeEventListener("popstate", callback);
  }, [changeLocation, prefetchLocation]);

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
    RouterContext.Provider,
    { value: { loc, changeLocation, prefetchLocation } },
    children,
  );
}

export function Router({
  basePath = "/RSC/",
  shouldSkip,
}: {
  basePath?: string;
  shouldSkip?: ShouldSkip;
}) {
  const { pathname, search } = parseLocation();
  const initialInput = getInputString(pathname, search);
  return createElement(
    Root as FunctionComponent<Omit<ComponentProps<typeof Root>, "children">>,
    { initialInput, basePath },
    createElement(InnerRouter, { basePath, shouldSkip }),
  );
}

// This is a trick to trigger fallback identified by the name.
export const Waku_SSR_Capable_Link = Link;
