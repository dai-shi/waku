'use client';

import { useRefetch } from 'waku/minimal/client';

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
