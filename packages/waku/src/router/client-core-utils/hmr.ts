import { startTransition, useEffect } from 'react';
import {
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from '../../minimal/client.js';
import { encodeRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { createRscParams, useRouterCache } from './caches.js';

export const useHmrRefetch = ({
  getSettledRoute,
  onBeforeRefetch,
}: {
  getSettledRoute: () => RouteProps;
  onBeforeRefetch?: () => void;
}): void => {
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const cache = useRouterCache();
  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        onBeforeRefetch?.();
        cache.clearCaches();
        const settledRoute = getSettledRoute();
        startTransition(() => {
          // the reload clears the set, so the response has to teach it again
          void mergeElements(
            cache.fetchRsc(
              encodeRoutePath(settledRoute.path),
              createRscParams(settledRoute.query),
            ),
          ).then(cache.learnStaticFromElements, () => {});
          cache.slices.forEachRegisteredLazySlice((id) => {
            cache.slices.fetchSlice(id, mergeElements, true);
          });
        });
      };
      return registerRscReloadListener(refetchRouteOnHmr);
    }
  }, [
    cache,
    getSettledRoute,
    mergeElements,
    onBeforeRefetch,
    registerRscReloadListener,
  ]);
};
