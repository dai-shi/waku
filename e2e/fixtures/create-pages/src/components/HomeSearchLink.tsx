'use client';

import { Link, useRouter } from 'waku/router/client';

export function HomeSearchLink() {
  const router = useRouter();
  return (
    <div>
      <button
        data-testid="home-to-search"
        onClick={() =>
          router.push({ to: '/search', search: { q: 'hello', page: 5 } })
        }
      >
        to search
      </button>
      <Link
        to={{ to: '/search', search: { q: 'linked', page: 7 } }}
        data-testid="home-to-search-link"
      >
        to search (link)
      </Link>
    </div>
  );
}
