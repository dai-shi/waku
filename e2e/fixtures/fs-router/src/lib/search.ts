import type { Unstable_SearchCodec } from 'waku/router';

export type DemoSearch = { q: string; page: number };

export const demoSearchCodec = {
  id: 'fs-demo',
  parse: (query: string): DemoSearch => {
    const sp = new URLSearchParams(query);
    return { q: sp.get('q') ?? '', page: Number(sp.get('page')) || 1 };
  },
  serialize: (search: DemoSearch): string =>
    new URLSearchParams({ q: search.q, page: String(search.page) }).toString(),
} as const satisfies Unstable_SearchCodec<DemoSearch>;
