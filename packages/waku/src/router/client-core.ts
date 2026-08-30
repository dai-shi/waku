'use client';

export {
  canReuseStaticRoute as unstable_canReuseStaticRoute,
  clearCaches as unstable_clearCaches,
  createRscParams as unstable_createRscParams,
  getPrefetch as unstable_getPrefetch,
  getPrefetchedElements as unstable_getPrefetchedElements,
  hasCachedShell as unstable_hasCachedShell,
  learnStaticFromElements as unstable_learnStaticFromElements,
  prefetchRoute as unstable_prefetchRoute,
} from './client-core-utils/caches.js';
export type {
  PrefetchHandle as Unstable_PrefetchHandle,
  PrefetchOptions as Unstable_PrefetchOptions,
} from './client-core-utils/caches.js';

export {
  getRouteFromElements as unstable_getRouteFromElements,
  has404FromElements as unstable_has404FromElements,
  isStaticFromElements as unstable_isStaticFromElements,
} from './client-core-utils/element-meta.js';

export {
  MAX_FOLLOWS_PER_NAVIGATION as unstable_MAX_FOLLOWS_PER_NAVIGATION,
  decideFollow as unstable_decideFollow,
  isFollowable as unstable_isFollowable,
} from './client-core-utils/error-route.js';
export type { FollowDecision as Unstable_FollowDecision } from './client-core-utils/error-route.js';

export { ErrorBoundary as ErrorBoundary_UNSTABLE } from './client-core-utils/error-boundary.js';

export {
  RouterHostContext as RouterHostContext_UNSTABLE,
  useRouterHost as useRouterHost_UNSTABLE,
} from './client-core-utils/host.js';
export type { RouterHost as Unstable_RouterHost } from './client-core-utils/host.js';

export { load as unstable_load } from './client-core-utils/load.js';
export type {
  LoadOptions as Unstable_LoadOptions,
  LoadOutcome as Unstable_LoadOutcome,
  Loaded as Unstable_Loaded,
} from './client-core-utils/load.js';

export { buildMergePatch as unstable_buildMergePatch } from './client-core-utils/merge-patch.js';

export {
  SearchCodecsProvider_UNSTABLE,
  useParams_UNSTABLE,
  useResolveSearchCodec as useResolveSearchCodec_UNSTABLE,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from './client-core-utils/route-hooks.js';

export { useHmrRefetch as useHmrRefetch_UNSTABLE } from './client-core-utils/hmr.js';

export {
  useInitialRoute as useInitialRoute_UNSTABLE,
  useInitialRscParams as useInitialRscParams_UNSTABLE,
} from './client-core-utils/initial-route.js';

export {
  getRouteUrl as unstable_getRouteUrl,
  isSameRoute as unstable_isSameRoute,
  isSameRscRoute as unstable_isSameRscRoute,
  parseRoute as unstable_parseRoute,
} from './client-core-utils/route-url.js';

export { Slice as Slice_UNSTABLE } from './client-core-utils/slice.js';
export type { SliceId as Unstable_SliceId } from './client-core-utils/slice.js';

export type {
  RouteParams as Unstable_RouteParams,
  RouteSearch as Unstable_RouteSearch,
} from './create-pages-utils/inferred-path-types.js';

export { buildRouteHref as unstable_buildRouteHref } from './isomorphic-utils/build-route-href.js';
export type {
  BuildRouteHrefTarget as Unstable_BuildRouteHrefTarget,
  RouteHref as Unstable_RouteHref,
  RoutePath as Unstable_RoutePath,
} from './isomorphic-utils/build-route-href.js';

export { matchRouteParams as unstable_matchRouteParams } from './isomorphic-utils/match-route-params.js';

export {
  HAS404_ID as unstable_HAS404_ID,
  IS_STATIC_ID as unstable_IS_STATIC_ID,
  ROUTE_ID as unstable_ROUTE_ID,
  decodeRoutePath as unstable_decodeRoutePath,
  decodeSliceId as unstable_decodeSliceId,
  encodeRoutePath as unstable_encodeRoutePath,
  encodeSliceId as unstable_encodeSliceId,
  getComponentIds as unstable_getComponentIds,
  getRouteSlotId as unstable_getRouteSlotId,
  getSliceSlotId as unstable_getSliceSlotId,
  isRouteSlotId as unstable_isRouteSlotId,
  isSliceSlotId as unstable_isSliceSlotId,
  pathnameToRoutePath as unstable_pathnameToRoutePath,
} from './isomorphic-utils/route-path.js';
export type { RouteProps as Unstable_RouteProps } from './isomorphic-utils/route-path.js';

export {
  getRouteSearchCodecId as unstable_getRouteSearchCodecId,
  isCodec as unstable_isCodec,
} from './isomorphic-utils/search-codec-registry.js';
export type {
  AnyCodec as Unstable_AnyCodec,
  Unstable_SearchCodec,
} from './isomorphic-utils/search-codec-registry.js';
