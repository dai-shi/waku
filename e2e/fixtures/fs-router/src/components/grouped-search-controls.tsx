'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';

export function GroupedSearchControls() {
  const search = useSearch({ from: '/grouped-search' });
  return <p data-testid="grouped-client-search">{JSON.stringify(search)}</p>;
}
