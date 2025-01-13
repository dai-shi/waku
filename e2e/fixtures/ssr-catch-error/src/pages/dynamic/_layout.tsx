import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ThrowsComponent from '../../components/server/throws.js';

export default async function DynamicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <ErrorBoundary fallback={<div>Something is wrong</div>}>
        <Suspense fallback={<div>Loading layout...</div>}>
          OK
          <ThrowsComponent />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
