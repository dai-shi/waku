import { Suspense } from 'react';
import ErrorBoundary from './ErrorBoundary.js';
import ErrorRender from './ErrorRender.js';
import { ServerThrows } from './ServerThrows/index.js';

const ErrorPage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return (
    <ErrorBoundary
      fallback={
        <div data-testid="fallback-outer">This should not be reached</div>
      }
    >
      <h2>Error Page</h2>
      <ErrorBoundary
        fallback={
          <div data-testid="fallback-render">Handling RSC render error</div>
        }
      >
        <Suspense>
          <ErrorRender />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary
        fallback={
          <div data-testid="fallback-function">Handling RSC function error</div>
        }
      >
        <Suspense>
          <ServerThrows />
        </Suspense>
      </ErrorBoundary>
    </ErrorBoundary>
  );
};
export default ErrorPage;
