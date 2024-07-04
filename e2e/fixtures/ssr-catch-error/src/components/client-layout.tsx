'use client';

import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

const FallbackComponent = ({ error }: { error: any }) => {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
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
