'use client';

import { useState } from 'react';

export const Counter = ({ max }: { max: number }) => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => (c < max ? c + 1 : max))}>
        Increment
      </button>
      <h3>This is a client component.</h3>
    </div>
  );
};
