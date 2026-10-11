'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';
import { nuqsSearchCodec } from '../lib/nuqs-search';

export function NuqsSearchControls() {
  const search = useSearch({
    path: '/nuqs-search',
    searchCodec: nuqsSearchCodec,
  });
  return <p data-testid="nuqs-client-search">{JSON.stringify(search)}</p>;
}
