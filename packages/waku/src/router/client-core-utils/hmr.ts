import { startTransition, useEffect } from 'react';
import {
  unstable_fetchRsc as fetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from '../../minimal/client.js';
import { encodeRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  clearCaches,
  createRscParams,
  learnStaticFromElements,
} from './caches.js';
import { fetchSlice, forEachRegisteredLazySlice } from './slice.js';

export const useHmrRefetch = ({
  getSettledRoute,
  onBeforeRefetch,
}: {
  getSettledRoute: () => RouteProps;
  onBeforeRefetch?: () => void;
}): void => {
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        onBeforeRefetch?.();
        clearCaches();
        const settledRoute = getSettledRoute();
        startTransition(() => {
          // the reload clears the set, so the response has to teach it again
          void mergeElements(
            fetchRsc(
              encodeRoutePath(settledRoute.path),
              createRscParams(settledRoute.query),
            ),
          ).then(learnStaticFromElements, () => {});
          forEachRegisteredLazySlice((id) => {
            fetchSlice(id, mergeElements, true);
          });
        });
      };
      return registerRscReloadListener(refetchRouteOnHmr);
    }
  }, [
    getSettledRoute,
    mergeElements,
    onBeforeRefetch,
    registerRscReloadListener,
  ]);
};
