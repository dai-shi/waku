import { use, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Slot_UNSTABLE as Slot,
  unstable_isImmutableElement as isImmutableElement,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../../minimal/client.js';
import { getSliceSlotId } from '../isomorphic-utils/route-path.js';
import { useRouterCache } from './caches.js';

export type SliceId = string;

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
  const { slices } = useRouterCache();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    if (props.lazy) {
      slices.registerLazySlice(id);
    }
  }, [id, props.lazy, slices]);
  useEffect(() => {
    if (needsToFetchSlice) {
      slices.fetchSlice(id, mergeElements);
    }
  }, [id, mergeElements, needsToFetchSlice, slices]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
