'use client';

import {
  useRouterHost_UNSTABLE as useRouterHost,
  useSearch_UNSTABLE as useSearch,
  useSetSearch_UNSTABLE as useSetSearch,
} from 'waku/router/client-core';

export const SearchProbe = () => {
  const { route } = useRouterHost();
  const search = useSearch({ from: '/search' });
  const setSearch = useSetSearch({ from: '/search' });
  return (
    <>
      <p data-testid="search">{search ? search.q : 'none'}</p>
      <p data-testid="host-hash">{route.hash}</p>
      <a href="#a" data-testid="hash-a">
        #a
      </a>
      <a href="#b" data-testid="hash-b">
        #b
      </a>
      <button
        type="button"
        data-testid="set-search"
        onClick={() => {
          void setSearch({ q: 'x' });
        }}
      >
        set
      </button>
      <button
        type="button"
        data-testid="set-search-replace"
        onClick={() => {
          void setSearch({ q: 'x' }, { history: 'replace' });
        }}
      >
        set replace
      </button>
    </>
  );
};
