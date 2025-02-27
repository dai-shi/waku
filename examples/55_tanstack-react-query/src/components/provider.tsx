'use client';

import {
  defaultShouldDehydrateQuery,
  isServer,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
// Can we port this to waku?
// import { ReactQueryStreamedHydration } from '@tanstack/react-query-next-experimental';
import {
  Persister,
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
      },
      dehydrate: {
        // include pending queries in dehydration
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}

let queryClient: QueryClient | undefined = undefined;
let persister: Persister | undefined = undefined;

export const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (!isServer) {
    if (!queryClient) {
      queryClient = makeQueryClient();
    }
    if (!persister) {
      persister = createSyncStoragePersister({
        storage: typeof window !== 'undefined' ? window.localStorage : null,
      });
    }
    return (
      // <QueryClientProvider client={queryClient}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        {/* <ReactQueryStreamedHydration>{children}</ReactQueryStreamedHydration> */}
        {children}
        <ReactQueryDevtools initialIsOpen />
      </PersistQueryClientProvider>
      // </QueryClientProvider>
    );
  }
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {children}
    </QueryClientProvider>
  );
};
