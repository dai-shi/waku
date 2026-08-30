import { use, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Slot_UNSTABLE as Slot,
  unstable_fetchRsc as fetchRsc,
  unstable_isImmutableElement as isImmutableElement,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../../minimal/client.js';
import {
  encodeSliceId,
  getSliceSlotId,
} from '../isomorphic-utils/route-path.js';

type Elements = Record<string | symbol, unknown>;

export type SliceId = string;

type SliceRequest = [promise: Promise<Elements>, replace: boolean];

const fetchingSlices = new Map<SliceId, SliceRequest>();
const registeredLazySlices = new Set<SliceId>();

export const registerLazySlice = (id: SliceId): void => {
  registeredLazySlices.add(id);
};

export const forEachRegisteredLazySlice = (fn: (id: SliceId) => void): void => {
  registeredLazySlices.forEach(fn);
};

export const clearRegisteredLazySlices = (): void => {
  registeredLazySlices.clear();
};

export const fetchSlice = (
  id: SliceId,
  mergeElements: ReturnType<typeof useMergeElements>,
  replace = false,
) => {
  let request = fetchingSlices.get(id);
  const isReplace = request?.[1];
  if (!request || (replace && !isReplace)) {
    request = [fetchRsc(encodeSliceId(id)), replace];
    fetchingSlices.set(id, request);
  }
  const current = request;
  const [promise] = current;
  promise
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
};

export const getInFlightSliceCount = (): number => fetchingSlices.size;

export const resetSliceFetches = (): void => {
  fetchingSlices.clear();
};

/**
 * Renders a named slice slot from the current RSC elements. With `lazy`, the
 * first visit fetches the slice if it is missing or mutable; later visits reuse
 * an immutable copy. The lazy `fallback` is shown only while the slot is absent
 * from the elements map (it does not reappear on a later refetch — see FIXME).
 */
export function Slice({
  id,
  children,
  ...props
}: {
  id: SliceId;
  children?: ReactNode;
} & (
  | {
      lazy?: false;
    }
  | {
      lazy: true;
      fallback: ReactNode;
    }
)) {
  const mergeElements = useMergeElements();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    if (props.lazy) {
      registerLazySlice(id);
    }
  }, [id, props.lazy]);
  useEffect(() => {
    if (needsToFetchSlice) {
      fetchSlice(id, mergeElements);
    }
  }, [id, mergeElements, needsToFetchSlice]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
