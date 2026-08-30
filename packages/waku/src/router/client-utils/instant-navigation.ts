import { useCallback } from 'react';
import {
  unstable_fetchRsc as fetchRsc,
  unstable_isImmutableElement as isImmutableElement,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../../minimal/client.js';
import {
  createRscParams,
  getPrefetch,
  getPrefetchedElements,
  hasCachedShell,
} from '../client-core-utils/caches.js';
import {
  isMetaKey,
  isStaticFromElements,
} from '../client-core-utils/element-meta.js';
import { abortable } from '../client-core-utils/load.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { ROUTER_STATE_ID } from './router-state.js';
import type { RouterState } from './router-state.js';

type Elements = Record<string | symbol, unknown>;

type InstantAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

export const canPaintInstantOverlay = (
  follows: number,
  route: RouteProps,
  resolvedElements: Record<string, unknown>,
) => !follows && hasCachedShell(route, resolvedElements);

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
  const mergeElements = useMergeElements();
  return useCallback(
    (attempt: InstantAttempt, state: RouterState, signal: AbortSignal) => {
      if (
        !canPaintInstantOverlay(attempt.follows, attempt.route, getElements())
      ) {
        return;
      }
      const cached = getPrefetch(attempt.route);
      const prefetchedElements = getPrefetchedElements(attempt.route);
      const overlay = {
        [ROUTER_STATE_ID]: state,
        [ROUTE_ID]: [attempt.route.path, attempt.route.query],
        [IS_STATIC_ID]: isStaticFromElements(getElements()),
      };
      const swr = {
        pin: pinForSwr(getElements),
        ...(prefetchedElements ? { base: prefetchedElements } : {}),
      };
      const response = cached
        ? abortable(cached.promise, signal)
        : fetchRsc(
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
      return mergeElements(response, {
        // SWR pins metadata, so the eager paint carries the requested route.
        unstable_overlay: overlay,
        unstable_swr: swr,
      });
    },
    [getElements, mergeElements, reloadWithUrl],
  );
};
