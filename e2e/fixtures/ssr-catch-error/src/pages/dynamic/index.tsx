import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link } from 'waku';
import ThrowsComponent from '../../components/server/throws.js';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Link to="/invalid">Invalid page</Link>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading page...</div>}>
          <ThrowsComponent />
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
