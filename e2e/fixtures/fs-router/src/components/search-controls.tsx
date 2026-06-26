'use client';

import {
  useSearch_UNSTABLE as useSearch,
  useSetSearch_UNSTABLE as useSetSearch,
} from 'waku/router/client';

export function SearchControls() {
  const search = useSearch({ from: '/search' });
  const setSearch = useSetSearch({ from: '/search' });
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
