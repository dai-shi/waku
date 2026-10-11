'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';
import { groupedSearchRoute } from '../lib/routes';

export function GroupedSearchControls() {
  const search = useSearch(groupedSearchRoute);
  return <p data-testid="grouped-client-search">{JSON.stringify(search)}</p>;
}
