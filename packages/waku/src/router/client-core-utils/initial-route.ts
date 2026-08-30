import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useElementsPromise_UNSTABLE as useElementsPromise } from '../../minimal/client.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { createRscParams } from './caches.js';
import { getRouteFromElements } from './element-meta.js';

export const useInitialRoute = (proposed: RouteProps): RouteProps => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const routeFromElements = getRouteFromElements(elements);
  const resolvedRoute =
    routeFromElements && routeFromElements.path !== proposed.path
      ? { ...routeFromElements, hash: proposed.hash }
      : proposed;
  const initialHashRef = useRef(resolvedRoute.hash);
  // state, not a ref: it is read during render
  const [initialRoute] = useState(() => ({ ...resolvedRoute, hash: '' }));
  // starts empty so hydration matches the server, then the effect fills it
  const [restoredHash, setRestoredHash] = useState('');
  useEffect(() => {
    // Browser bindings restore the address-bar hash after hydration.
    // An in-memory host should not use this hook.
    setRestoredHash(window.location.hash || initialHashRef.current);
  }, []);
  return useMemo(
    () => ({ ...initialRoute, hash: restoredHash }),
    [initialRoute, restoredHash],
  );
};

// A suspended mount has no cleanup, so keep this aligned with Minimal's cache.
const INITIAL_RSC_PARAMS_LIMIT = 32;
const initialRscParamsCache = new Map<string, URLSearchParams>();

const createInitialRscParams = (
  rscPath: string,
  query: string,
): URLSearchParams => {
  const key = JSON.stringify([rscPath, query]);
  const cached = initialRscParamsCache.get(key);
  if (cached) {
    initialRscParamsCache.delete(key);
    initialRscParamsCache.set(key, cached);
    return cached;
  }
  const rscParams = createRscParams(query);
  if (initialRscParamsCache.size === INITIAL_RSC_PARAMS_LIMIT) {
    const oldest = initialRscParamsCache.keys().next().value;
    if (oldest !== undefined) {
      initialRscParamsCache.delete(oldest);
    }
  }
  initialRscParamsCache.set(key, rscParams);
  return rscParams;
};

const releaseInitialRscParams = (rscParams: URLSearchParams) => {
  for (const [key, cached] of initialRscParamsCache) {
    if (cached === rscParams) {
      initialRscParamsCache.delete(key);
      return;
    }
  }
};

/**
 * Initial RSC params for one Root mount. Pass the result to `Root_UNSTABLE`.
 * The same `rscPath` and `query` reuse one object until this mount commits. A
 * suspended mount has no cleanup.
 */
export const useInitialRscParams = (
  rscPath: string,
  query: string,
): URLSearchParams => {
  const [initialRscParams] = useState(() =>
    createInitialRscParams(rscPath, query),
  );
  useLayoutEffect(() => {
    // not a cleanup: a suspended mount never commits, so this would not run
    releaseInitialRscParams(initialRscParams);
  }, [initialRscParams]);
  return initialRscParams;
};
