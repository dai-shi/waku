import type { PageProps } from 'waku/router';
import { SearchControls } from '../components/search-controls';
import { demoSearchCodec } from '../lib/search';

export default function SearchPage({ search }: PageProps<'/search'>) {
  return (
    <div>
      <h2>Search</h2>
      <p data-testid="server-search">{JSON.stringify(search)}</p>
      <SearchControls />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: demoSearchCodec,
  } as const;
};
