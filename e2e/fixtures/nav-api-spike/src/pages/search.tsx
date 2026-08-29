import { unstable_redirect as redirect } from 'waku/router/server';
import { SearchProbe } from '../components/search-probe.js';
import { spikeSearchCodec } from '../lib/search.js';

export default function SearchPage({ query = '' }: { query?: string }) {
  if (new URLSearchParams(query).get('q') === 'from-follow') {
    redirect('/search?q=spent');
  }
  return (
    <div>
      <h1 data-testid="search-heading">Search</h1>
      <SearchProbe />
      <div data-testid="search-spacer" style={{ height: '200vh' }} />
    </div>
  );
}

export const getConfig = () =>
  ({
    render: 'dynamic',
    unstable_searchCodec: spikeSearchCodec,
  }) as const;
