import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link } from 'waku';
import ThrowsDelayedComponent from '../../components/server/throws-delayed.js';

export default async function HomePage() {
  return (
    <div>
      <p>Dynamic Delayed Page</p>
      <Link to="/dynamic">Dynamic Home Page</Link>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading page...</div>}>
          <ThrowsDelayedComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
