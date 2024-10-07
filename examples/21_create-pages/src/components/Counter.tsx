'use client';

import { useState } from 'react';
import { Link, useRouter_UNSTABLE as useRouter } from 'waku/router/client';

import { jump } from './funcs';

export const Counter = () => {
  const { path } = useRouter();
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      <span>path: {path}</span>
      <p>
        <Link to="/">Go to Home</Link>
      </p>
      <p>
        <button onClick={() => jump()}>Jump to random page</button>
      </p>
    </div>
  );
};
