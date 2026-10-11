'use client';

import {
  useSearch_UNSTABLE as useSearch,
  useSetSearch_UNSTABLE as useSetSearch,
} from 'waku/router/client';
import { searchRoute } from '../lib/routes';

export function SearchControls() {
  const search = useSearch(searchRoute);
  const setSearch = useSetSearch(searchRoute);
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
