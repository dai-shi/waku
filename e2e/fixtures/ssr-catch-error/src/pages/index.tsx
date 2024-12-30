import { ErrorBoundary } from 'react-error-boundary';
import { Link } from 'waku';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Link to="/invalid">Invalid page</Link>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        Empty children
      </ErrorBoundary>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
