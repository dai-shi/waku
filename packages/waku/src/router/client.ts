'use client';

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
} from 'react';
import type {
  ComponentProps,
  FunctionComponent,
  ReactNode,
  AnchorHTMLAttributes,
  ReactElement,
  MouseEvent,
} from 'react';

import { prefetchRSC, Root, Slot, useRefetch } from '../client.js';
import {
  getComponentIds,
  getInputString,
  PARAM_KEY_SKIP,
  SHOULD_SKIP_ID,
  LOCATION_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const parseLocation = () => {
  if ((globalThis as any).__WAKU_ROUTER_404__) {
    return { path: '/404', searchParams: new URLSearchParams(), hash: '' };
  }
  const { pathname, search, hash } = window.location;
  const searchParams = new URLSearchParams(search);
  if (searchParams.has(PARAM_KEY_SKIP)) {
    console.warn(`The search param "${PARAM_KEY_SKIP}" is reserved`);
  }
  return { path: pathname, searchParams, hash };
};

type ChangeLocation = (
  path?: string,
  searchParams?: URLSearchParams,
  options?: {
    hash?: string;
    method?: 'pushState' | 'replaceState' | false;
    unstable_skipRefetch?: boolean;
  },
) => void;

type PrefetchLocation = (path: string, searchParams: URLSearchParams) => void;

const RouterContext = createContext<{
  loc: ReturnType<typeof parseLocation>;
  changeLocation: ChangeLocation;
  prefetchLocation: PrefetchLocation;
} | null>(null);

export function useChangeLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    return () => {
      throw new Error('Missing Router');
    };
  }
  return value.changeLocation;
}

export function useLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('Missing Router');
  }
  return value.loc;
}

export type LinkProps = {
  to: string;
  pending?: ReactNode;
  notPending?: ReactNode;
  children: ReactNode;
  unstable_prefetchOnEnter?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
  ...props
}: LinkProps): ReactElement {
  if (!to.startsWith('/')) {
    throw new Error('Link must start with "/"');
  }
  const value = useContext(RouterContext);
  const changeLocation = value
    ? value.changeLocation
    : () => {
        throw new Error('Missing Router');
      };
  const prefetchLocation = value
    ? value.prefetchLocation
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const url = new URL(to, window.location.href);
    if (url.href !== window.location.href) {
      prefetchLocation(url.pathname, url.searchParams);
      startTransition(() => {
        changeLocation(url.pathname, url.searchParams, { hash: url.hash });
      });
    }
    props.onClick?.(event);
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        const url = new URL(to, window.location.href);
        if (url.href !== window.location.href) {
          prefetchLocation(url.pathname, url.searchParams);
        }
        props.onMouseEnter?.(event);
      }
    : props.onMouseEnter;
  const ele = createElement(
    'a',
    { ...props, href: to, onClick, onMouseEnter },
    children,
  );
  if (isPending && pending !== undefined) {
    return createElement(Fragment, null, ele, pending);
  }
  if (!isPending && notPending !== undefined) {
    return createElement(Fragment, null, ele, notPending);
  }
  return ele;
}

const getSkipList = (
  shouldSkip: ShouldSkip | undefined,
  componentIds: readonly string[],
  props: RouteProps,
  cached: Record<string, RouteProps>,
): string[] => {
  const shouldSkipObj = Object.fromEntries(shouldSkip || []);
  return componentIds.filter((id) => {
    const prevProps = cached[id];
    if (!prevProps) {
      return false;
    }
    const shouldCheck = shouldSkipObj[id];
    if (!shouldCheck) {
      return false;
    }
    if (shouldCheck[0] && props.path !== prevProps.path) {
      return false;
    }
    if (
      shouldCheck[1]?.some(
        (key) =>
          props.searchParams.get(key) !== prevProps.searchParams.get(key),
      )
    ) {
      return false;
    }
    return true;
  });
};

const equalRouteProps = (a: RouteProps, b: RouteProps) => {
  if (a.path !== b.path) {
    return false;
  }
  if (a.searchParams.size !== b.searchParams.size) {
    return false;
  }
  if (
    Array.from(a.searchParams.entries()).some(
      ([key, value]) => value !== b.searchParams.get(key),
    )
  ) {
    return false;
  }
  return true;
};

function InnerRouter({ routerData }: { routerData: RouterData }) {
  const refetch = useRefetch();

  const [loc, setLoc] = useState(parseLocation);
  const componentIds = getComponentIds(loc.path);

  const [cached, setCached] = useState<Record<string, RouteProps>>(() => {
    return Object.fromEntries(componentIds.map((id) => [id, loc]));
  });
  const cachedRef = useRef(cached);
  useEffect(() => {
    cachedRef.current = cached;
  }, [cached]);

  const changeLocation: ChangeLocation = useCallback(
    (path, searchParams, options) => {
      const {
        hash,
        method = 'pushState',
        unstable_skipRefetch,
      } = options || {};
      const url = new URL(window.location.href);
      if (typeof path === 'string') {
        url.pathname = path;
      }
      if (searchParams) {
        url.search = searchParams.toString();
      }
      if (typeof hash === 'string') {
        url.hash = hash;
      }
      if (method) {
        window.history[method](window.history.state, '', url);
      }
      const loc = parseLocation();
      setLoc(loc);
      const componentIds = getComponentIds(loc.path);
      if (
        !method &&
        componentIds.every((id) => {
          const cachedLoc = cachedRef.current[id];
          return cachedLoc && equalRouteProps(cachedLoc, loc);
        })
      ) {
        return; // everything is cached
      }
      const shouldSkip = routerData[0];
      const skip = getSkipList(
        shouldSkip,
        componentIds,
        loc,
        cachedRef.current,
      );
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is skipped
      }
      const input = getInputString(loc.path);
      if (!unstable_skipRefetch) {
        refetch(
          input,
          new URLSearchParams([
            ...Array.from(loc.searchParams.entries()),
            ...skip.map((id) => [PARAM_KEY_SKIP, id]),
          ]),
        );
      }
      setCached((prev) => ({
        ...prev,
        ...Object.fromEntries(
          componentIds.flatMap((id) => (skip.includes(id) ? [] : [[id, loc]])),
        ),
      }));
    },
    [refetch, routerData],
  );

  const prefetchLocation: PrefetchLocation = useCallback(
    (path, searchParams) => {
      const componentIds = getComponentIds(path);
      const routeProps: RouteProps = { path, searchParams };
      const shouldSkip = routerData[0];
      const skip = getSkipList(
        shouldSkip,
        componentIds,
        routeProps,
        cachedRef.current,
      );
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is cached
      }
      const input = getInputString(path);
      const searchParamsString = new URLSearchParams([
        ...Array.from(searchParams.entries()),
        ...skip.map((id) => [PARAM_KEY_SKIP, id]),
      ]).toString();
      prefetchRSC(input, searchParamsString);
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(path);
    },
    [routerData],
  );

  useEffect(() => {
    const callback = () => {
      const loc = parseLocation();
      changeLocation(loc.path, loc.searchParams, {
        hash: '',
        method: false,
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeLocation]);

  useEffect(() => {
    const callback = (pathname: string, searchParams: URLSearchParams) => {
      changeLocation(pathname, searchParams, {
        hash: '',
        unstable_skipRefetch: true,
      });
    };
    const listeners = (routerData[1] ||= new Set());
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [changeLocation, routerData]);

  useEffect(() => {
    const { hash } = loc;
    const element = hash && document.getElementById(hash.slice(1));
    window.scrollTo({
      left: 0,
      top: element ? element.getBoundingClientRect().top + window.scrollY : 0,
      behavior: 'instant',
    });
  }, [loc]);

  const children = componentIds.reduceRight(
    (acc: ReactNode, id) => createElement(Slot, { id, fallback: acc }, acc),
    null,
  );

  return createElement(
    RouterContext.Provider,
    { value: { loc, changeLocation, prefetchLocation } },
    children,
  );
}

// Note: The router data must be a stable mutable object (array).
type RouterData = [
  shouldSkip?: ShouldSkip,
  locationListners?: Set<
    (pathname: string, searchParams: URLSearchParams) => void
  >,
];

const DEFAULT_ROUTER_DATA: RouterData = [];

export function Router({ routerData = DEFAULT_ROUTER_DATA }) {
  const loc = parseLocation();
  const initialInput = getInputString(loc.path);
  const initialSearchParamsString = loc.searchParams.toString();
  const unstable_onFetchData = (data: unknown) => {
    Promise.resolve(data)
      .then((data) => {
        if (data && typeof data === 'object') {
          // We need to process SHOULD_SKIP_ID before LOCATION_ID
          if (SHOULD_SKIP_ID in data) {
            routerData[0] = data[SHOULD_SKIP_ID] as ShouldSkip;
          }
          if (LOCATION_ID in data) {
            const [pathname, searchParamsString] = data[LOCATION_ID] as [
              string,
              string,
            ];
            // FIXME this check here seems ad-hoc (less readable code)
            if (
              window.location.pathname !== pathname ||
              window.location.search.replace(/^\?/, '') !== searchParamsString
            ) {
              routerData[1]?.forEach((listener) =>
                listener(pathname, new URLSearchParams(searchParamsString)),
              );
            }
          }
        }
      })
      .catch(() => {});
  };
  return createElement(
    Root as FunctionComponent<Omit<ComponentProps<typeof Root>, 'children'>>,
    { initialInput, initialSearchParamsString, unstable_onFetchData },
    createElement(InnerRouter, { routerData }),
  );
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

/**
 * ServerRouter for SSR
 * This is not a public API.
 */
export function ServerRouter({
  children,
  loc,
}: {
  children: ReactNode;
  loc: ReturnType<typeof parseLocation>;
}) {
  return createElement(
    Fragment,
    null,
    createElement(
      RouterContext.Provider,
      {
        value: {
          loc,
          changeLocation: notAvailableInServer('changeLocation'),
          prefetchLocation: notAvailableInServer('prefetchLocation'),
        },
      },
      children,
    ),
  );
}
