'use client';

import type { ReactNode } from 'react';
import { SearchCodecsProvider_UNSTABLE as SearchCodecsProvider } from 'waku/router/client-core';
import * as searchCodecs from '../lib/search.js';

export const SearchCodecs = ({ children }: { children: ReactNode }) => (
  <SearchCodecsProvider searchCodecs={searchCodecs}>
    {children}
  </SearchCodecsProvider>
);
