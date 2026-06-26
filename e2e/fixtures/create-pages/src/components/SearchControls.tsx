'use client';

import { useSearch_UNSTABLE, useSetSearch_UNSTABLE } from 'waku/router/client';

export function SearchControls() {
  const search = useSearch_UNSTABLE({ from: '/search' });
  const setSearch = useSetSearch_UNSTABLE({ from: '/search' });
  return (
    <div>
      <p data-testid="client-search">{JSON.stringify(search)}</p>
      <button
        data-testid="next-page"
        onClick={() => setSearch((prev) => ({ page: prev.page + 1 }))}
      >
        next
      </button>
    </div>
  );
}
