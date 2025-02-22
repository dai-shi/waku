import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'waku';

const SlowComponent = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <div>Slow Component</div>;
};

const LongSuspenseLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h2>Long Suspense Layout</h2>
      <Link to="/long-suspense/2">Click Me</Link>
      <Suspense fallback={<div data-testid="long-suspense">Loading...</div>}>
        <SlowComponent />
      </Suspense>
      {children}
    </div>
  );
};

export default LongSuspenseLayout;
