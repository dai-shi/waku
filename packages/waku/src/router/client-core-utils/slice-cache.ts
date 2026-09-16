import type { useMergeElements_UNSTABLE as useMergeElements } from '../../minimal/client.js';
import { encodeSliceId } from '../isomorphic-utils/route-path.js';
import type { FetchRsc } from './caches.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type SliceRequest = [promise: Promise<Elements>, replace: boolean];

export const createSliceCache = (fetchRsc: FetchRsc) => {
  const fetchingSlices = new Map<string, SliceRequest>();
  const registeredLazySlices = new Set<string>();
  return {
    registerLazySlice: (id: string): void => {
      registeredLazySlices.add(id);
    },
    forEachRegisteredLazySlice: (fn: (id: string) => void): void => {
      registeredLazySlices.forEach(fn);
    },
    fetchSlice: (
      id: string,
      mergeElements: ReturnType<typeof useMergeElements>,
      replace = false,
    ): void => {
      let request = fetchingSlices.get(id);
      if (!request || (replace && !request[1])) {
        request = [fetchRsc(encodeSliceId(id)), replace];
        fetchingSlices.set(id, request);
      }
      const current = request;
      current[0]
        .then((result) => {
          if (fetchingSlices.get(id) === current) {
            return mergeElements(result);
          }
        })
        .catch((e) => {
          console.error('Failed to fetch slice:', e);
        })
        .finally(() => {
          if (fetchingSlices.get(id) === current) {
            fetchingSlices.delete(id);
          }
        });
    },
    getInFlightSliceCount: (): number => fetchingSlices.size,
  };
};
