'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';

export function NuqsSearchControls() {
  const search = useSearch({ from: '/nuqs-search' });
  return <p data-testid="nuqs-client-search">{JSON.stringify(search)}</p>;
}
