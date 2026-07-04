import type { ReactNode } from 'react';
import { ErrorBoundary } from 'waku/router/client';
import { RouteEvents } from '../components/route-events.js';

// RouteEvents lives in the root element, outside the router's redirect
// error boundary, so it keeps counting completions while a redirect error
// unmounts the route slot.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <html>
        <head />
        <body>
          <RouteEvents />
          {children}
        </body>
      </html>
    </ErrorBoundary>
  );
}
