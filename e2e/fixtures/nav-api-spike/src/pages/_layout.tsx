import type { ReactNode } from 'react';
import { SearchCodecs } from '../components/search-codecs.js';
import { OwningFollowCount } from '../nav-binding.js';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SearchCodecs>
      <div>
        <OwningFollowCount />
        <title>nav-api-spike</title>
        <nav>
          <a href="/" data-testid="go-home">
            Home
          </a>
          <a href="/static" data-testid="go-static">
            Static
          </a>
          <a href="/hello/spike" data-testid="go-hello">
            Hello
          </a>
          <a href="/search?q=hi" data-testid="go-search">
            Search
          </a>
          <a href="/with-slice" data-testid="go-slice">
            Slice
          </a>
          <a href="/missing" data-testid="go-missing">
            Missing
          </a>
          <a href="/old" data-testid="go-old">
            Old
          </a>
          <a href="/canonical?v=old" data-testid="go-canonical">
            Canonical
          </a>
          <a href="/hash-only" data-testid="go-hash-only">
            Hash only
          </a>
          <a href="/bounce?v=a" data-testid="go-bounce">
            Bounce
          </a>
          <a href="/search?q=from-follow" data-testid="go-search-from-follow">
            Search from follow
          </a>
          <a href="/mix" data-testid="go-mix">
            Mix
          </a>
          <a href="/mix-budget" data-testid="go-mix-budget">
            Mix budget
          </a>
        </nav>
        {children}
      </div>
    </SearchCodecs>
  );
}

export const getConfig = () => ({ render: 'static' }) as const;
