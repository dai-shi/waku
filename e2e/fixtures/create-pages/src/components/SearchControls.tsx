'use client';

import { useSearch_UNSTABLE, useSetSearch_UNSTABLE } from 'waku/router/client';
import { searchRoute } from '../lib/routes';

export function SearchControls() {
  const search = useSearch_UNSTABLE(searchRoute);
  const setSearch = useSetSearch_UNSTABLE(searchRoute);
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
