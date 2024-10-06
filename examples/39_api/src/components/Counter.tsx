'use client';

import { Suspense, use, useState, useEffect } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);
  const [promise, setPromise] = useState<Promise<unknown>>();
  useEffect(() => {
    setPromise(fetch('/api/hello').then((res) => res.text()));
  }, []);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      <Suspense fallback={<p>Loading...</p>}>
        {promise && <Hello promise={promise} />}
      </Suspense>
    </div>
  );
};

const Hello = ({ promise }: { promise: Promise<unknown> }) => {
  const message = `${use(promise)}`;
  return (
    <div>
      <p>Hello, {message}</p>
    </div>
  );
};
