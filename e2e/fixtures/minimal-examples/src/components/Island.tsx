'use client';

import { use, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE,
} from 'waku/minimal/client';
import { Counter } from './Counter';

const useRefetch = () => {
  const fetchRsc = useFetchRsc();
  const mergeElements = useMergeElements_UNSTABLE();
  return useCallback(
    (rscPath: string, slotId: string) => {
      const isSlot = (key: string | symbol) => key === slotId;
      return mergeElements(
        fetchRsc(rscPath).then((next) =>
          combineElements({}, next, { unstable_filter: isSlot }),
        ),
      );
    },
    [fetchRsc, mergeElements],
  );
};

export function Island() {
  return (
    <Slice id="dynamic" fallback={<p data-testid="island">Loading island</p>}>
      <Counter />
    </Slice>
  );
}

function Slice({
  id,
  children,
  fallback,
}: {
  id: string;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const slotId = `slice:${id}`;
  const refetch = useRefetch();
  const elements = use(useElementsPromise());
  const hasSlice = slotId in elements;
  useEffect(() => {
    if (!hasSlice) {
      refetch('island', slotId).catch((e) => {
        console.error('Failed to refetch island:', e);
      });
    }
  }, [hasSlice, refetch, slotId]);
  if (!hasSlice) {
    return fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
