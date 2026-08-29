'use client';

import { StrictMode, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { Router, useRouter } from 'waku/router/client';

export const NestedRouteState = () => {
  const router = useRouter();
  return <p data-testid="route-query">{router.query}</p>;
};

const RouterFrame = ({
  path,
  query,
  testId,
}: {
  path: '/multiple-router' | '/other-router';
  query: string;
  testId: string;
}) => {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  return (
    <>
      <iframe ref={setFrame} data-testid={testId} title={testId} />
      {frame?.contentDocument &&
        createPortal(
          <StrictMode>
            <Suspense fallback={<p>Loading router</p>}>
              <Router initialRoute={{ path, query, hash: '' }} />
            </Suspense>
          </StrictMode>,
          // React supports Document containers, but @types/react-dom omits it.
          frame.contentDocument as unknown as DocumentFragment,
        )}
    </>
  );
};

export const MultipleRouters = () => {
  const [mounted, setMounted] = useState(false);
  return (
    <div>
      <button
        data-testid="mount-routers"
        onClick={() => setMounted(true)}
        type="button"
      >
        Mount Routers
      </button>
      {mounted && (
        <>
          <RouterFrame
            path="/multiple-router"
            query="name=first"
            testId="first-router"
          />
          <RouterFrame
            path="/multiple-router"
            query="name=second"
            testId="second-router"
          />
          <RouterFrame path="/multiple-router" query="" testId="third-router" />
          <RouterFrame path="/other-router" query="" testId="fourth-router" />
        </>
      )}
    </div>
  );
};
