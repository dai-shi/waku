import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav data-testid="nav">
        <Link to="/">home</Link>
        {' | '}
        <Link to="/post/1" unstable_instant data-testid="link-post-1">
          post 1
        </Link>
        {' | '}
        <Link to="/post/2" unstable_instant data-testid="link-post-2">
          post 2
        </Link>
        {' | '}
        <Link to="/post/3" unstable_instant data-testid="link-post-3">
          post 3
        </Link>
        {' | '}
        <Link to="/widget" unstable_instant data-testid="link-widget">
          widget
        </Link>
        {' | '}
        <Link to="/gate" unstable_instant data-testid="link-gate">
          gate
        </Link>
        {' | '}
        <Link
          to="/slow"
          unstable_instant
          unstable_prefetchOnView={{ mode: 'once', ttl: 300 }}
          data-testid="link-slow"
        >
          slow
        </Link>
        {' | '}
        <Link
          to="/hover"
          unstable_prefetchOnEnter={{ ttl: 600 }}
          data-testid="link-hover"
        >
          hover
        </Link>
      </nav>
      <main>
        <Suspense fallback={<div data-testid="page-skeleton">loading...</div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
