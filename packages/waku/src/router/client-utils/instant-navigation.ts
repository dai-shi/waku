import { unstable_isImmutableElement as isImmutableElement } from '../../minimal/client.js';
import { hasCachedShell } from '../client-core-utils/caches.js';
import { isMetaKey } from '../client-core-utils/element-meta.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export const canPaintInstantOverlay = (
  follows: number,
  route: RouteProps,
  resolvedElements: Record<string, unknown>,
) => !follows && hasCachedShell(route, resolvedElements);

// symbol keys are client owned; they are carried, never fetched
export const pinForSwr =
  (getResolvedElements: () => Record<string, unknown>) =>
  (key: string | symbol) =>
    typeof key === 'symbol' ||
    isMetaKey(key) ||
    isImmutableElement(getResolvedElements(), key);
