import type { ReactNode } from 'react';
import { deserializeRsc, serializeRsc } from 'waku/server';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import {
  isRouteSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import { type SlotId, pathSpecKey } from './config.js';

export const ROOT_SLOT_ID = 'root';

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export type CacheId = string;

export const createElementCache = (
  onSerialize?: (cacheId: CacheId, serialized: string) => void,
) => {
  const cache = new Map<CacheId, Promise<Uint8Array>>();
  return {
    preload: (cacheId: CacheId, bytes: Uint8Array) => {
      cache.set(cacheId, Promise.resolve(bytes));
    },
    has: (cacheId: CacheId) => cache.has(cacheId),
    get: (cacheId: CacheId) => {
      const cachedBytes = cache.get(cacheId);
      if (!cachedBytes) {
        return undefined;
      }
      return cachedBytes.then((bytes) =>
        deserializeRsc(bytes),
      ) as Promise<ReactNode>;
    },
    set: (cacheId: CacheId, element: ReactNode) => {
      if (cache.has(cacheId)) {
        return;
      }
      const bytesPromise = serializeRsc(element);
      cache.set(cacheId, bytesPromise);
      if (onSerialize) {
        return bytesPromise.then((bytes) => {
          onSerialize(cacheId, bytesToBase64(bytes));
        });
      }
    },
  };
};

export type ElementCache = ReturnType<typeof createElementCache>;

export const getSlotCacheId = (slotId: SlotId): CacheId => `slot/${slotId}`;
export const getPathSpecCacheId = (pathSpec: PathSpec): CacheId =>
  `pathSpec/${pathSpecKey(pathSpec)}`; // For routeElement

export const assertNonReservedSlotId = (slotId: SlotId) => {
  if (
    slotId === ROOT_SLOT_ID ||
    isRouteSlotId(slotId) ||
    isSliceSlotId(slotId) ||
    // Capitalized ids are reserved for define-router such as ROUTE_ID, IS_STATIC_ID, HAS404_ID
    /^[A-Z]/.test(slotId)
  ) {
    throw new Error(
      'Element ID cannot be "root", "route:*", "slice:*", or start with a capital letter',
    );
  }
};
