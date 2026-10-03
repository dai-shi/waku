import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import {
  isRouteSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import { pathSpecKey } from './config.js';

export {
  ROOT_SLOT_ID,
  base64ToBytes,
  createElementCache,
  getSlotCacheId,
} from '../define-router-utils/element-cache.js';
export type {
  CacheId,
  ElementCache,
} from '../define-router-utils/element-cache.js';

export const getPathSpecCacheId = (pathSpec: PathSpec) =>
  `pathSpec/${pathSpecKey(pathSpec)}`;

export const assertNonReservedSlotId = (slotId: string) => {
  if (
    slotId === 'root' ||
    isRouteSlotId(slotId) ||
    isSliceSlotId(slotId) ||
    /^[A-Z]/.test(slotId)
  ) {
    throw new Error(
      'Element ID cannot be "root", "route:*", "slice:*", or start with a capital letter',
    );
  }
};
