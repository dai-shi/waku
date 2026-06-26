import { Link } from 'waku';
import type { PageProps } from 'waku/router';
import { SearchControls } from './SearchControls.js';

export default function SearchPage({ search }: PageProps<'/search'>) {
  return (
    <div>
      <h1>Search</h1>
      <p data-testid="server-search">{JSON.stringify(search)}</p>
      <SearchControls />
      <Link to="/" data-testid="search-to-home">
        Home
      </Link>
    </div>
  );
}
