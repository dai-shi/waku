import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { getRerenderOrderCount } from './rerender-order-store.js';
import {
  RerenderOrderBoundary,
  RerenderOrderForm,
  RerenderOrderTrigger,
} from './RerenderOrderClient.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createRerenderOrderLayout = (delay: number) => {
  const Layout = async ({ children }: { children: ReactNode }) => {
    if (delay) {
      await sleep(delay);
    }
    return (
      <div>
        <h2>Rerender Order Layout ({delay}ms)</h2>
        {children}
      </div>
    );
  };
  return Layout;
};

// An async component streams as its own lazy row after the content that
// references it.
const Row = async ({ index }: { index: number }) => {
  await sleep(index);
  return <li>{`row ${index}`}</li>;
};

const SlowContent = async ({
  mode,
  delay,
}: {
  mode: string;
  delay: number;
}) => {
  await sleep(delay);
  return (
    <div>
      <p data-testid="rerender-order-count">{`count: ${getRerenderOrderCount(mode)}`}</p>
      <RerenderOrderForm mode={mode} />
      <RerenderOrderTrigger />
      <ul>
        {Array.from({ length: 5 }, (_, i) => (
          <Row key={i} index={i + 1} />
        ))}
      </ul>
    </div>
  );
};

export const createRerenderOrderPage = (mode: string, delay: number) => {
  const Page = async () => {
    await sleep(10);
    return (
      <div>
        <h3>Rerender Order Page</h3>
        <RerenderOrderBoundary>
          <Suspense key="1" fallback={<p>loading...</p>}>
            <SlowContent mode={mode} delay={delay} />
          </Suspense>
        </RerenderOrderBoundary>
      </div>
    );
  };
  return Page;
};
