import { useCallback } from 'react';
import { unstable_isImmutableElement as isImmutableElement } from 'waku/minimal/client';
import {
  createRscParams,
  useRouterCache,
} from '../client-core-utils/caches.js';
import type { RouterCache } from '../client-core-utils/caches.js';
import { abortable } from '../client-core-utils/load.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  isMetaKey,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import { useMergeInstantElements } from './instant-elements.js';
import { ROUTER_STATE_ID } from './router-state.js';
import type { RouterState } from './router-state.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type InstantAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

export const canPaintInstantOverlay = (
  cache: RouterCache,
  follows: number,
  route: RouteProps,
  resolvedElements: Record<string, unknown>,
) => !follows && cache.hasCachedShell(route, resolvedElements);

// symbol keys are client owned; they are carried, never fetched
export const pinForSwr =
  (getResolvedElements: () => Elements) => (key: string | symbol) =>
    typeof key === 'symbol' ||
    isMetaKey(key) ||
    isImmutableElement(getResolvedElements(), key);

export const useStartInstantPaint = (
  getElements: () => Elements,
  reloadWithUrl: (url: URL) => void,
) => {
  const mergeInstantElements = useMergeInstantElements();
  const cache = useRouterCache();
  return useCallback(
    (attempt: InstantAttempt, state: RouterState, signal: AbortSignal) => {
      if (
        !canPaintInstantOverlay(
          cache,
          attempt.follows,
          attempt.route,
          getElements(),
        )
      ) {
        return;
      }
      const cached = cache.getPrefetch(attempt.route);
      const prefetchedElements = cache.getPrefetchedElements(attempt.route);
      const overlay = {
        [ROUTER_STATE_ID]: state,
        [ROUTE_ID]: [attempt.route.path, attempt.route.query],
        [IS_STATIC_ID]: isStaticFromElements(getElements()),
      };
      const response = cached
        ? cached.promise
        : cache.fetchRsc(
            encodeRoutePath(attempt.route.path),
            createRscParams(attempt.route.query),
            {
              signal,
              onBuildIdMismatch: () => reloadWithUrl(attempt.url),
              ...(prefetchedElements
                ? { unstable_base: prefetchedElements }
                : {}),
            },
          );
      return mergeInstantElements(
        abortable(response, signal),
        signal,
        pinForSwr(getElements),
        prefetchedElements,
        overlay,
      );
    },
    [cache, getElements, mergeInstantElements, reloadWithUrl],
  );
};
