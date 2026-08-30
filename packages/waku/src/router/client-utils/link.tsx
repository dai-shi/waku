import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useTransition,
} from 'react';
import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
  RefObject,
  TransitionFunction,
} from 'react';
import { preloadModule } from 'react-dom';
import { unstable_addBase as addBase } from '../../minimal/client.js';
import {
  type PrefetchOptions,
  canReuseStaticRoute,
  prefetchRoute as prefetchCachedRoute,
} from '../client-core-utils/caches.js';
import { useResolveSearchCodec } from '../client-core-utils/route-hooks.js';
import { isSameRscRoute, parseRoute } from '../client-core-utils/route-url.js';
import { buildRouteHref } from '../isomorphic-utils/build-route-href.js';
import type {
  BuildRouteHrefTarget,
  RouteHref,
  RoutePath,
} from '../isomorphic-utils/build-route-href.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { RouterContext, dispatchChangeRoute } from './router-context.js';
import { scrollToHash, shouldScrollByDefault } from './scroll.js';

export const resolveRouteHref = <Path extends RoutePath>(
  to: RouteHref | BuildRouteHrefTarget<Path>,
  resolveCodec: ReturnType<typeof useResolveSearchCodec>,
): string =>
  addBase(
    typeof to === 'string' ? to : buildRouteHref(to, resolveCodec),
    import.meta.env.WAKU_CONFIG_BASE_PATH,
  );

export const preloadRouteModules = (path: string) => {
  globalThis.__WAKU_ROUTER_PREFETCH__?.(path, (id) => {
    preloadModule(id, { as: 'script' });
  });
};

export const prefetchRouteUnlessReusable = (
  route: RouteProps,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) => {
  const elements = getElements?.();
  // a shared staticPathSet is not enough; skip only when this root has the slot
  if (elements && canReuseStaticRoute(route, elements)) {
    return;
  }
  prefetchCachedRoute(route, options);
};

const prefetchIfNotCurrent = (
  current: RouteProps | undefined,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) => {
  if (!current) {
    return;
  }
  const route = parseRoute(new URL(resolvedTo, window.location.href));
  if (!isSameRscRoute(route, current)) {
    preloadRouteModules(route.path);
    prefetchRouteUnlessReusable(route, options, getElements);
  }
};

// HACK: commit-phase .current write; extracted so react-hooks/immutability ignores it.
const assignRef = <T,>(ref: RefObject<T | null>, node: T | null): void => {
  ref.current = node;
};

function useSharedRef<T>(
  ref: Ref<T | null> | undefined,
): [RefObject<T | null>, (node: T | null) => void | (() => void)] {
  const managedRef = useRef<T | null>(null);

  const handleRef = useCallback(
    (node: T | null): void | (() => void) => {
      assignRef(managedRef, node);
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        return () => {
          assignRef(managedRef, null);
          if (cleanup) {
            cleanup();
          } else {
            ref(null);
          }
        };
      }
      if (ref) {
        assignRef(ref, node);
      }
      return () => {
        assignRef(managedRef, null);
        if (ref) {
          assignRef(ref, null);
        }
      };
    },
    [ref],
  );

  return [managedRef, handleRef];
}

const usePrefetchOnView = (
  ref: RefObject<HTMLAnchorElement | null>,
  current: RouteProps | undefined,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) => {
  const enabled = !!options;
  const mode = options?.mode;
  const ttl = options?.ttl;
  useEffect(() => {
    if (!enabled || !ref.current) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            prefetchIfNotCurrent(
              current,
              resolvedTo,
              {
                ...(mode ? { mode } : {}),
                ...(ttl !== undefined ? { ttl } : {}),
              },
              getElements,
            );
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [enabled, mode, ttl, current, resolvedTo, ref, getElements]);
};

const isAltClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 ||
  !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);

type NavigationStatus = { pending?: boolean };

const NavigationStatusContext = createContext<NavigationStatus>({});

/**
 * Returns the navigation status of the enclosing `Link`, like React's
 * `useFormStatus`. `pending` is `true` while the navigation transition is in
 * flight, until the destination route's async components resolve. Returns an
 * empty object when called outside a `Link`.
 */
export const useNavigationStatus_UNSTABLE = (): NavigationStatus =>
  useContext(NavigationStatusContext);

export type LinkProps<Path extends RoutePath> = {
  to: RouteHref | BuildRouteHrefTarget<Path>;
  children: ReactNode;
  /**
   * Whether the link should scroll on navigation.
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change or repeated same-hash click (not query-only)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its `<Suspense>` fallbacks right
   * away and stream the dynamic parts in.
   */
  unstable_instant?: boolean;
  unstable_prefetchOnEnter?: PrefetchOptions;
  unstable_prefetchOnView?: PrefetchOptions;
  /**
   * Overrides how the destination is committed, e.g. to integrate the browser
   * View Transitions API. It runs after required route data is ready. When
   * `unstable_instant` can commit immediately from cache, this is ignored. When
   * provided, React's `useTransition` is bypassed, so
   * `useNavigationStatus_UNSTABLE()` stays `{ pending: false }` for this link.
   */
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

/**
 * Client-side navigation link. Renders an `<a>`; click handling pushes through
 * the router unless the click is modified or prevented. A non-`_self` `target`
 * is discouraged and still routes in place (use `<a>` instead). Failures
 * surface through the router error boundary rather than a returned promise.
 */
export function Link<Path extends RoutePath>({
  to,
  children,
  scroll,
  unstable_instant,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  ref: refProp,
  ...props
}: LinkProps<Path>): ReactElement {
  const resolveCodec = useResolveSearchCodec();
  const resolvedTo = resolveRouteHref(to, resolveCodec);
  const router = useContext(RouterContext);
  const changeRoute = router
    ? router.changeRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const [ref, setRef] = useSharedRef<HTMLAnchorElement>(refProp);

  usePrefetchOnView(
    ref,
    router?.route,
    resolvedTo,
    unstable_prefetchOnView,
    router?.getElements,
  );
  const internalOnClick = () => {
    const url = new URL(resolvedTo, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      preloadRouteModules(route.path);
      dispatchChangeRoute(
        changeRoute,
        route,
        {
          shouldScroll: scroll ?? shouldScrollByDefault(url),
          history: 'push',
          url,
          instant: unstable_instant,
          startTransition: unstable_startTransition,
        },
        startTransition,
        // a click has no caller to reject to; the boundary shows the failure
      ).catch(() => {});
    } else if (url.hash && scroll !== false) {
      scrollToHash(url.hash, 'auto', false);
    }
  };
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented || isAltClick(event)) {
      return;
    }
    if (props.target && props.target.toLowerCase() !== '_self') {
      console.warn('[Link] `target` is discouraged. Use `<a>` for this case.');
    }
    if (
      props.download !== undefined &&
      props.download !== null &&
      props.download !== false
    ) {
      console.warn(
        '[Link] `download` is discouraged. Use `<a>` for this case.',
      );
    }
    event.preventDefault();
    internalOnClick();
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        prefetchIfNotCurrent(
          router?.route,
          resolvedTo,
          unstable_prefetchOnEnter,
          router?.getElements,
        );
        props.onMouseEnter?.(event);
      }
    : props.onMouseEnter;
  const navigationStatus = useMemo(() => ({ pending: isPending }), [isPending]);
  return (
    <NavigationStatusContext value={navigationStatus}>
      <a
        {...props}
        href={resolvedTo}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        ref={setRef}
      >
        {children}
      </a>
    </NavigationStatusContext>
  );
}
