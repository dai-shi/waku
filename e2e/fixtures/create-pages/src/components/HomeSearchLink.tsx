'use client';

import { Link, useRouter } from 'waku/router/client';
import { searchRoute } from '../lib/routes';

export function HomeSearchLink() {
  const router = useRouter();
  return (
    <div>
      <button
        data-testid="home-to-search"
        onClick={() =>
          router.push(searchRoute({ search: { q: 'hello', page: 5 } }))
        }
      >
        to search
      </button>
      <Link
        to={searchRoute({ search: { q: 'linked', page: 7 } })}
        data-testid="home-to-search-link"
      >
        to search (link)
      </Link>
    </div>
  );
}
