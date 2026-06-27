'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';

export function ZodSearchControls() {
  const search = useSearch({ from: '/zod-search' });
  return <p data-testid="zod-client-search">{JSON.stringify(search)}</p>;
}
