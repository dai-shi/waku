import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link } from 'waku';
import ThrowsDelayedComponent from '../components/server/throws-delayed.js';

export default async function HomePage() {
  return (
    <div>
      <p>Delayed Throws Page</p>
      <Link to="/">Home page</Link>
      <br />
      <Link to="/invalid">Invalid page</Link>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <ThrowsDelayedComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
