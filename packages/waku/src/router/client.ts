'use client';

import {
  Component,
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
  MutableRefObject,
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

const normalizeRoutePath = (path: string) => {
  for (const suffix of ['/', '/index.html']) {
    if (path.endsWith(suffix)) {
      return path.slice(0, -suffix.length) || '/';
    }
  }
  return path;
};

const parseRoute = (url: URL): RouteProps => {
  if ((globalThis as any).__WAKU_ROUTER_404__) {
    return { path: '/404', searchParams: new URLSearchParams() };
  }
  const { pathname, searchParams } = url;
  if (searchParams.has(PARAM_KEY_SKIP)) {
    console.warn(`The search param "${PARAM_KEY_SKIP}" is reserved`);
  }
  return { path: normalizeRoutePath(pathname), searchParams };
};

type ChangeRoute = (
  route: RouteProps,
  options?: {
    checkCache?: boolean;
    skipRefetch?: boolean;
  },
) => void;

type PrefetchRoute = (route: RouteProps) => void;

const RouterContext = createContext<{
  route: RouteProps;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
} | null>(null);

export function useRouter_UNSTABLE() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { route, changeRoute, prefetchRoute } = router;
  const push = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.href);
      window.history.pushState(
        {
          ...window.history.state,
          waku_new_path: url.pathname !== window.location.pathname,
        },
        '',
        url,
      );
      changeRoute(parseRoute(url));
    },
    [changeRoute],
  );
  const replace = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.href);
      window.history.replaceState(window.history.state, '', url);
      changeRoute(parseRoute(url));
    },
    [changeRoute],
  );
  const reload = useCallback(() => {
    const url = new URL(window.location.href);
    changeRoute(parseRoute(url));
  }, [changeRoute]);
  const back = useCallback(() => {
    // FIXME is this correct?
    window.history.back();
  }, []);
  const forward = useCallback(() => {
    // FIXME is this correct?
    window.history.forward();
  }, []);
  const prefetch = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.href);
      prefetchRoute(parseRoute(url));
    },
    [prefetchRoute],
  );
  return {
    get value() {
      console.warn(
        'router.value is deprecated. Use router.path and router.searchParams instead.',
      );
      return route;
    },
    ...route,
    push,
    replace,
    reload,
    back,
    forward,
    prefetch,
  };
}

export type LinkProps = {
  to: string;
  pending?: ReactNode;
  notPending?: ReactNode;
  children: ReactNode;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  ...props
}: LinkProps): ReactElement {
  const router = useContext(RouterContext);
  const changeRoute = router
    ? router.changeRoute
    : () => {
        throw new Error('Missing Router');
      };
  const prefetchRoute = router
    ? router.prefetchRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLAnchorElement>();

  useEffect(() => {
    if (unstable_prefetchOnView && ref.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const url = new URL(to, window.location.href);
              if (router && url.href !== window.location.href) {
                const route = parseRoute(url);
                router.prefetchRoute(route);
              }
            }
          });
        },
        { threshold: 0.1 },
      );

      observer.observe(ref.current);

      return () => {
        observer.disconnect();
      };
    }
  }, [unstable_prefetchOnView, router, to]);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const url = new URL(to, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      prefetchRoute(route);
      startTransition(() => {
        window.history.pushState(
          {
            ...window.history.state,
            waku_new_path: url.pathname !== window.location.pathname,
          },
          '',
          url,
        );
        changeRoute(route);
      });
    }
    props.onClick?.(event);
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        const url = new URL(to, window.location.href);
        if (url.href !== window.location.href) {
          const route = parseRoute(url);
          prefetchRoute(route);
        }
        props.onMouseEnter?.(event);
      }
    : props.onMouseEnter;
  const ele = createElement(
    'a',
    { ...props, href: to, onClick, onMouseEnter, ref },
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
  route: RouteProps,
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
    if (shouldCheck[0] && route.path !== prevProps.path) {
      return false;
    }
    if (
      shouldCheck[1]?.some(
        (key) =>
          route.searchParams.get(key) !== prevProps.searchParams.get(key),
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
      ([key, val]) => val !== b.searchParams.get(key),
    )
  ) {
    return false;
  }
  return true;
};

const RouterSlot = ({
  route,
  routerData,
  cachedRef,
  id,
  fallback,
  children,
}: {
  route: RouteProps;
  routerData: RouterData;
  cachedRef: MutableRefObject<Record<string, RouteProps>>;
  id: string;
  fallback?: ReactNode;
  children?: ReactNode;
}) => {
  const unstable_shouldRenderPrev = (_err: unknown) => {
    const shouldSkip = routerData[0];
    const skip = getSkipList(shouldSkip, [id], route, cachedRef.current);
    return skip.length > 0;
  };
  return createElement(
    Slot,
    { id, fallback, unstable_shouldRenderPrev },
    children,
  );
};

const InnerRouter = ({ routerData }: { routerData: RouterData }) => {
  const refetch = useRefetch();

  const [route, setRoute] = useState(() =>
    parseRoute(new URL(window.location.href)),
  );
  const componentIds = getComponentIds(route.path);

  const [cached, setCached] = useState<Record<string, RouteProps>>(() => {
    return Object.fromEntries(componentIds.map((id) => [id, route]));
  });
  const cachedRef = useRef(cached);
  useEffect(() => {
    cachedRef.current = cached;
  }, [cached]);

  const changeRoute: ChangeRoute = useCallback(
    (route, options) => {
      const { checkCache, skipRefetch } = options || {};
      setRoute(route);
      const componentIds = getComponentIds(route.path);
      if (
        checkCache &&
        componentIds.every((id) => {
          const cachedLoc = cachedRef.current[id];
          return cachedLoc && equalRouteProps(cachedLoc, route);
        })
      ) {
        return; // everything is cached
      }
      const shouldSkip = routerData[0];
      const skip = getSkipList(
        shouldSkip,
        componentIds,
        route,
        cachedRef.current,
      );
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is skipped
      }
      const input = getInputString(route.path);
      if (!skipRefetch) {
        refetch(
          input,
          new URLSearchParams([
            ...Array.from(route.searchParams.entries()),
            ...skip.map((id) => [PARAM_KEY_SKIP, id]),
          ]),
        );
      }
      setCached((prev) => ({
        ...prev,
        ...Object.fromEntries(
          componentIds.flatMap((id) =>
            skip.includes(id) ? [] : [[id, route]],
          ),
        ),
      }));
    },
    [refetch, routerData],
  );

  const prefetchRoute: PrefetchRoute = useCallback(
    (route) => {
      const componentIds = getComponentIds(route.path);
      const shouldSkip = routerData[0];
      const skip = getSkipList(
        shouldSkip,
        componentIds,
        route,
        cachedRef.current,
      );
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is cached
      }
      const input = getInputString(route.path);
      const searchParamsString = new URLSearchParams([
        ...Array.from(route.searchParams.entries()),
        ...skip.map((id) => [PARAM_KEY_SKIP, id]),
      ]).toString();
      prefetchRSC(input, searchParamsString);
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(route.path);
    },
    [routerData],
  );

  useEffect(() => {
    const callback = () => {
      const route = parseRoute(new URL(window.location.href));
      changeRoute(route, { checkCache: true });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute]);

  useEffect(() => {
    const callback = (pathname: string, searchParamsString: string) => {
      const url = new URL(window.location.href);
      url.pathname = pathname;
      url.search = searchParamsString;
      url.hash = '';
      window.history.pushState(
        {
          ...window.history.state,
          waku_new_path: url.pathname !== window.location.pathname,
        },
        '',
        url,
      );
      changeRoute(parseRoute(url), { skipRefetch: true });
    };
    const listeners = (routerData[1] ||= new Set());
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [changeRoute, routerData]);

  useEffect(() => {
    const { hash } = window.location;
    const { state } = window.history;
    const element = hash && document.getElementById(hash.slice(1));
    window.scrollTo({
      left: 0,
      top: element ? element.getBoundingClientRect().top + window.scrollY : 0,
      behavior: state?.waku_new_path ? 'instant' : 'auto',
    });
  });

  const children = componentIds.reduceRight(
    (acc: ReactNode, id) =>
      createElement(
        RouterSlot,
        { route, routerData, cachedRef, id, fallback: acc },
        acc,
      ),
    null,
  );

  return createElement(
    RouterContext.Provider,
    { value: { route, changeRoute, prefetchRoute } },
    children,
  );
};

// Note: The router data must be a stable mutable object (array).
type RouterData = [
  shouldSkip?: ShouldSkip,
  locationListners?: Set<
    (pathname: string, searchParamsString: string) => void
  >,
];

const DEFAULT_ROUTER_DATA: RouterData = [];

export function Router({ routerData = DEFAULT_ROUTER_DATA }) {
  const route = parseRoute(new URL(window.location.href));
  const initialInput = getInputString(route.path);
  const initialSearchParamsString = route.searchParams.toString();
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
                listener(pathname, searchParamsString),
              );
            }
          }
        }
      })
      .catch(() => {});
  };
  return createElement(
    ErrorBoundary,
    null,
    createElement(
      Root as FunctionComponent<Omit<ComponentProps<typeof Root>, 'children'>>,
      { initialInput, initialSearchParamsString, unstable_onFetchData },
      createElement(InnerRouter, { routerData }),
    ),
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
  route,
}: {
  children: ReactNode;
  route: RouteProps;
}) {
  return createElement(
    Fragment,
    null,
    createElement(
      RouterContext.Provider,
      {
        value: {
          route,
          changeRoute: notAvailableInServer('changeRoute'),
          prefetchRoute: notAvailableInServer('prefetchRoute'),
        },
      },
      children,
    ),
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: unknown }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      if (
        this.state.error instanceof Error &&
        (this.state.error as any).statusCode === 404
      ) {
        return createElement('h1', null, 'Not Found');
      }
      return createElement('h1', null, String(this.state.error));
    }
    return this.props.children;
  }
}
