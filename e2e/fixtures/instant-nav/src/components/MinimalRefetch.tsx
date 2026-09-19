'use client';

import { useCallback } from 'react';
import {
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from 'waku/minimal/client';

const useRefetch = () => {
  const fetchRsc = useFetchRsc();
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  return useCallback(
    (rscPath: string, rscParams?: unknown) => {
      const refetch = () => mergeElements(fetchRsc(rscPath, rscParams));
      registerRscReloadListener(
        () => {
          void refetch();
        },
        { replace: true },
      );
      return refetch();
    },
    [fetchRsc, mergeElements, registerRscReloadListener],
  );
};

export function MinimalRefetch() {
  const refetch = useRefetch();
  return (
    <button
      type="button"
      data-testid="minimal-refetch"
      onClick={() =>
        void refetch('R/widget', new URLSearchParams({ query: '' }))
      }
    >
      refetch
    </button>
  );
}
