'use client';

import { use, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Slot_UNSTABLE as Slot,
  unstable_fetchRsc,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE,
} from 'waku/minimal/client';
import { Counter } from './Counter';

const useRefetch = () => {
  const mergeElements = useMergeElements_UNSTABLE();
  return useCallback(
    (rscPath: string) => mergeElements(unstable_fetchRsc(rscPath)),
    [mergeElements],
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
      refetch('island').catch((e) => {
        console.error('Failed to refetch island:', e);
      });
    }
  }, [hasSlice, refetch]);
  if (!hasSlice) {
    return fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
