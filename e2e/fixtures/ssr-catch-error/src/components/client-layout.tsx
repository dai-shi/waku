'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { Link, useRouter } from 'waku';

const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
  useEffect(() => {
    window.addEventListener('popstate', resetErrorBoundary);
    return () => window.removeEventListener('popstate', resetErrorBoundary);
  }, [resetErrorBoundary]);
  return (
    <div role="alert">
      <p>Unexpected error in client fallback</p>
      <pre style={{ color: 'red' }}>{(error as any).message}</pre>
      <pre style={{ color: 'red' }}>{(error as any).statusCode}</pre>
    </div>
  );
};

export const ClientLayout = ({ children }: { children: ReactNode }) => {
  // Resetting only on popstate races the router: the reset re-render can
  // re-catch a stale error kept in the elements cache and latch again before
  // the fresh navigation commits. Keying the boundary on the rendered route
  // resets it after each commit, which makes the recovery deterministic.
  const { path, query } = useRouter();
  return (
    <div>
      <ul>
        <li>
          <Link to="/">/</Link>
        </li>
        <li>
          <Link to="/dynamic">/dynamic</Link>
        </li>
        <li>
          <Link to="/invalid">Invalid page</Link>
        </li>
        <li>
          <Link to="/dynamic?fail=1">Invalid query</Link>
        </li>
        <li>
          <Link to="/suspense">/suspense</Link>
        </li>
        <li>
          <Link to="/no-error">/no-error</Link>
        </li>
      </ul>
      <ErrorBoundary
        FallbackComponent={FallbackComponent}
        resetKeys={[path, query]}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
};
