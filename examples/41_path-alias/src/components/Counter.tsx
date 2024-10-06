'use client';

import { useState } from 'react';

import { MyFragment } from '@/components/MyFragment';

export const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <MyFragment>
        <p>Count: {count}</p>
      </MyFragment>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
    </div>
  );
};
