'use client';

import type { ReactNode } from 'react';
import { SearchCodecsProvider_UNSTABLE } from 'waku/router/client';
import * as searchCodecs from '../lib/search.js';

export function AppSearchCodecs({ children }: { children: ReactNode }) {
  return (
    <SearchCodecsProvider_UNSTABLE searchCodecs={searchCodecs}>
      {children}
    </SearchCodecsProvider_UNSTABLE>
  );
}
