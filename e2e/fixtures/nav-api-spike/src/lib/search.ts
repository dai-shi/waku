import type { Unstable_SearchCodec } from 'waku/router';

export type SpikeSearch = { q: string };

export const spikeSearchCodec = {
  id: 'nav-api-spike',
  parse: (query: string): SpikeSearch => {
    const sp = new URLSearchParams(query);
    return { q: sp.get('q') ?? '' };
  },
  serialize: (search: SpikeSearch): string =>
    new URLSearchParams({ q: search.q }).toString(),
} as const;

spikeSearchCodec satisfies Unstable_SearchCodec<SpikeSearch>;

declare module 'waku/router' {
  interface SearchCodecsConfig {
    '/search': typeof spikeSearchCodec;
  }
}
