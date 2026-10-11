import type { Unstable_SearchCodec } from 'waku/router';

export const searchCodec: Unstable_SearchCodec<{ q: string }> = {
  parse: (query) => ({ q: new URLSearchParams(query).get('q') || '' }),
  serialize: (search) => {
    if (typeof search.q !== 'string') {
      throw new Error('Invalid search');
    }
    return new URLSearchParams(search).toString();
  },
};
