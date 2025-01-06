'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';

const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
  useEffect(() => {
    window.addEventListener('popstate', resetErrorBoundary);
    return () => window.removeEventListener('popstate', resetErrorBoundary);
  }, [resetErrorBoundary]);
  return (
    <div role="alert">
      <p>Unexpected error in client fallback</p>
      <pre style={{ color: 'red' }}>{error.message}</pre>
      {error.statusCode && (
        <pre style={{ color: 'red' }}>{error.statusCode}</pre>
      )}
    </div>
  );
};

export const ClientLayout = ({ children }: { children: ReactNode }) => {
  return (
    <ErrorBoundary FallbackComponent={FallbackComponent}>
      {children}
    </ErrorBoundary>
  );
};
