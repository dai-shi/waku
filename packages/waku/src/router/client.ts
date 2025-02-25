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
  Component,
} from 'react';
import type {
  ComponentProps,
  FunctionComponent,
  ReactNode,
  AnchorHTMLAttributes,
  ReactElement,
  MouseEvent,
} from 'react';

import {
  fetchRsc,
  prefetchRsc,
  Root,
  Slot,
  useRefetch,
} from '../minimal/client.js';
import {
  encodeRoutePath,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
  SKIP_HEADER,
} from './common.js';
import type { RouteProps } from './common.js';
import type { RouteConfig } from './base-types.js';
import { getErrorInfo } from '../lib/utils/custom-errors.js';

type AllowPathDecorators<Path extends string> = Path extends unknown
  ? Path | `${Path}?${string}` | `${Path}#${string}`
  : never;

type InferredPaths = RouteConfig extends {
  paths: infer UserPaths extends string;
}
  ? AllowPathDecorators<UserPaths>
  : string;

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
  const { pathname, searchParams, hash } = url;
  return {
    path: normalizeRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
};

const parseRouteFromLocation = (): RouteProps => {
  if ((globalThis as any).__WAKU_ROUTER_404__) {
    return { path: '/404', query: '', hash: '' };
  }
  return parseRoute(new URL(window.location.href));
};

let savedRscParams: [query: string, rscParams: URLSearchParams] | undefined;

const createRscParams = (query: string): URLSearchParams => {
  if (savedRscParams && savedRscParams[0] === query) {
    return savedRscParams[1];
  }
  const rscParams = new URLSearchParams({ query });
  savedRscParams = [query, rscParams];
  return rscParams;
};

type ChangeRoute = (
  route: RouteProps,
  options: {
    shouldScroll: boolean;
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
    (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path change (not on searchParams change)
         */
        scroll?: boolean;
      },
    ) => {
      const url = new URL(to, window.location.href);
      const newPath = url.pathname !== window.location.pathname;
      window.history.pushState(
        {
          ...window.history.state,
          waku_new_path: newPath,
        },
        '',
        url,
      );
      changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
      });
    },
    [changeRoute],
  );
  const replace = useCallback(
    (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path change (not on searchParams change)
         */
        scroll?: boolean;
      },
    ) => {
      const url = new URL(to, window.location.href);
      const newPath = url.pathname !== window.location.pathname;
      window.history.replaceState(window.history.state, '', url);
      changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
      });
    },
    [changeRoute],
  );
  const reload = useCallback(() => {
    const url = new URL(window.location.href);
    changeRoute(parseRoute(url), { shouldScroll: true });
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
  to: InferredPaths;
  children: ReactNode;
  /**
   * indicates if the link should scroll or not on navigation
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path change (not on searchParams change)
   */
  scroll?: boolean;
  unstable_pending?: ReactNode;
  unstable_notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
  unstable_startTransition?: ((fn: () => void) => void) | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  scroll,
  unstable_pending,
  unstable_notPending,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
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
  const startTransitionFn =
    unstable_startTransition ||
    ((unstable_pending || unstable_notPending) && startTransition) ||
    ((fn: () => void) => fn());
  const ref = useRef<HTMLAnchorElement>(undefined);

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
      startTransitionFn(() => {
        const newPath = url.pathname !== window.location.pathname;
        window.history.pushState(
          {
            ...window.history.state,
            waku_new_path: newPath,
          },
          '',
          url,
        );
        changeRoute(route, { shouldScroll: scroll ?? newPath });
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
  if (isPending && unstable_pending !== undefined) {
    return createElement(Fragment, null, ele, unstable_pending);
  }
  if (!isPending && unstable_notPending !== undefined) {
    return createElement(Fragment, null, ele, unstable_notPending);
  }
  return ele;
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

function renderError(message: string) {
  return createElement(
    'html',
    null,
    createElement('body', null, createElement('h1', null, message)),
  );
}

export class ErrorBoundary extends Component<
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
      if (this.state.error instanceof Error) {
        return renderError(this.state.error.message);
      }
      return renderError(String(this.state.error));
    }
    return this.props.children;
  }
}

const NotFound = ({ reset }: { reset: () => void }) => {
  // TODO show a custom 404 page
  useEffect(() => {
    reset();
  }, [reset]);
  return createElement('h1', null, 'Not Found');
};

const Redirect = ({ to, reset }: { to: string; reset: () => void }) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    const url = new URL(to, window.location.href);
    if (url.hostname !== window.location.hostname) {
      window.location.replace(to);
      return;
    }
    const newPath = url.pathname !== window.location.pathname;
    window.history.pushState(
      {
        ...window.history.state,
        waku_new_path: newPath,
      },
      '',
      url,
    );
    changeRoute(parseRoute(url), { shouldScroll: newPath });
    reset();
  }, [to, reset, changeRoute]);
  return null;
};

class CustomErrorHandler extends Component<
  { children: ReactNode },
  { error?: unknown }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {};
    this.reset = this.reset.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({});
  }
  render() {
    if ('error' in this.state) {
      const error = this.state.error;
      const info = getErrorInfo(error);
      if (info?.status === 404) {
        return createElement(NotFound, { reset: this.reset });
      }
      if (info?.location) {
        return createElement(Redirect, {
          to: info.location,
          reset: this.reset,
        });
      }
      throw error;
    }
    return this.props.children;
  }
}

const getRouteSlotId = (path: string) => 'route:' + path;

const handleScroll = () => {
  const { hash } = window.location;
  const { state } = window.history;
  const element = hash && document.getElementById(hash.slice(1));
  window.scrollTo({
    left: 0,
    top: element ? element.getBoundingClientRect().top + window.scrollY : 0,
    behavior: state?.waku_new_path ? 'instant' : 'auto',
  });
};

const InnerRouter = ({
  routerData,
  initialRoute,
}: {
  routerData: Required<RouterData>;
  initialRoute: RouteProps;
}) => {
  const [locationListeners, staticPathSet] = routerData;
  const refetch = useRefetch();
  const [route, setRoute] = useState(() => ({
    // This is the first initialization of the route, and it has
    // to ignore the hash, because on server side there is none.
    // Otherwise there will be a hydration error.
    // The client side route, including the hash, will be updated in the effect below.
    ...initialRoute,
    hash: '',
  }));
  // Update the route post-load to include the current hash.
  useEffect(() => {
    setRoute((prev) => {
      if (
        prev.path === initialRoute.path &&
        prev.query === initialRoute.query &&
        prev.hash === initialRoute.hash
      ) {
        return prev;
      }
      return initialRoute;
    });
  }, [initialRoute]);

  const changeRoute: ChangeRoute = useCallback(
    (route, options) => {
      const { skipRefetch } = options || {};
      if (!staticPathSet.has(route.path) && !skipRefetch) {
        const rscPath = encodeRoutePath(route.path);
        const rscParams = createRscParams(route.query);
        refetch(rscPath, rscParams);
      }
      if (options.shouldScroll) {
        handleScroll();
      }
      setRoute(route);
    },
    [refetch, staticPathSet],
  );

  const prefetchRoute: PrefetchRoute = useCallback(
    (route) => {
      if (staticPathSet.has(route.path)) {
        return;
      }
      const rscPath = encodeRoutePath(route.path);
      const rscParams = createRscParams(route.query);
      prefetchRsc(rscPath, rscParams);
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(route.path);
    },
    [staticPathSet],
  );

  useEffect(() => {
    const callback = () => {
      const route = parseRoute(new URL(window.location.href));
      changeRoute(route, { shouldScroll: true });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute]);

  useEffect(() => {
    const callback = (path: string, query: string) => {
      const url = new URL(window.location.href);
      url.pathname = path;
      url.search = query;
      url.hash = '';
      if (path !== '/404') {
        window.history.pushState(
          {
            ...window.history.state,
            waku_new_path: url.pathname !== window.location.pathname,
          },
          '',
          url,
        );
      }
      changeRoute(parseRoute(url), { skipRefetch: true, shouldScroll: false });
    };
    locationListeners.add(callback);
    return () => {
      locationListeners.delete(callback);
    };
  }, [changeRoute, locationListeners]);

  const routeElement = createElement(Slot, { id: getRouteSlotId(route.path) });
  const rootElement = createElement(
    Slot,
    { id: 'root', unstable_fallbackToPrev: true },
    createElement(CustomErrorHandler, null, routeElement),
  );
  return createElement(
    RouterContext.Provider,
    { value: { route, changeRoute, prefetchRoute } },
    rootElement,
  );
};

// Note: The router data must be a stable mutable object (array).
type RouterData = [
  locationListeners?: Set<(path: string, query: string) => void>,
  staticPathSet?: Set<string>,
  cachedIdSet?: Set<string>,
  has404?: boolean,
];

const DEFAULT_ROUTER_DATA: RouterData = [];

export function Router({
  routerData = DEFAULT_ROUTER_DATA,
  initialRoute = parseRouteFromLocation(),
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const locationListeners = (routerData[0] ||= new Set());
  const staticPathSet = (routerData[1] ||= new Set());
  const cachedIdSet = (routerData[2] ||= new Set());
  const unstable_enhanceFetch =
    (fetchFn: typeof fetch) =>
    (input: RequestInfo | URL, init: RequestInit = {}) => {
      const skipStr = JSON.stringify(Array.from(cachedIdSet));
      const headers = (init.headers ||= {});
      if (Array.isArray(headers)) {
        headers.push([SKIP_HEADER, skipStr]);
      } else {
        (headers as Record<string, string>)[SKIP_HEADER] = skipStr;
      }
      return fetchFn(input, init);
    };
  const unstable_enhanceCreateData =
    (
      createData: (
        responsePromise: Promise<Response>,
      ) => Promise<Record<string, unknown>>,
    ) =>
    async (responsePromise: Promise<Response>) => {
      const has404 = (routerData[3] ||= false);
      const response = await responsePromise;
      if (response.status === 404 && has404) {
        // HACK this is still an experimental logic. It's very fragile.
        // FIXME we should cache it if 404.txt is static.
        return fetchRsc(encodeRoutePath('/404'));
      }
      const data = createData(responsePromise);
      Promise.resolve(data)
        .then((data) => {
          if (data && typeof data === 'object') {
            const {
              [ROUTE_ID]: routeData,
              [IS_STATIC_ID]: isStatic,
              [HAS404_ID]: has404,
              ...rest
            } = data;
            if (routeData) {
              const [path, query] = routeData as [string, string];
              // FIXME this check here seems ad-hoc (less readable code)
              if (
                window.location.pathname !== path ||
                (!isStatic &&
                  window.location.search.replace(/^\?/, '') !== query)
              ) {
                locationListeners.forEach((listener) => listener(path, query));
              }
              if (isStatic) {
                staticPathSet.add(path);
              }
            }
            if (has404) {
              routerData[3] = true;
            }
            Object.keys(rest).forEach((id) => {
              cachedIdSet.add(id);
            });
          }
        })
        .catch(() => {});
      return data;
    };
  const initialRscParams = createRscParams(initialRoute.query);
  return createElement(
    Root as FunctionComponent<Omit<ComponentProps<typeof Root>, 'children'>>,
    {
      initialRscPath,
      initialRscParams,
      unstable_enhanceFetch,
      unstable_enhanceCreateData,
    },
    createElement(InnerRouter, {
      routerData: routerData as Required<RouterData>,
      initialRoute,
    }),
  );
}

/**
 * ServerRouter for SSR
 * This is not a public API.
 */
export function INTERNAL_ServerRouter({ route }: { route: RouteProps }) {
  const routeElement = createElement(Slot, { id: getRouteSlotId(route.path) });
  const rootElement = createElement(
    Slot,
    { id: 'root', unstable_fallbackToPrev: true },
    routeElement,
  );
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
      rootElement,
    ),
  );
}
