'use client';

import type { ReactNode } from 'react';
import { Unstable_SearchCodecsProvider } from 'waku/router/client';
import * as searchCodecs from '../lib/search.js';

export function AppSearchCodecs({ children }: { children: ReactNode }) {
  return (
    <Unstable_SearchCodecsProvider searchCodecs={searchCodecs}>
      {children}
    </Unstable_SearchCodecsProvider>
  );
}
