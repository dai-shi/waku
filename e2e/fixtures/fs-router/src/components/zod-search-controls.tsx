'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';
import { zodSearchCodec } from '../lib/zod-search';

export function ZodSearchControls() {
  const search = useSearch({
    path: '/zod-search',
    searchCodec: zodSearchCodec,
  });
  return <p data-testid="zod-client-search">{JSON.stringify(search)}</p>;
}
