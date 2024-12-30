'use client';

import { useState } from 'react';

export const CounterWithoutSsr = () => {
  if (typeof window === 'undefined') {
    throw new Error('This component is for client only.');
  }
  const [count, setCount] = useState(0);
  const handleClick = () => {
    setCount((c) => c + 1);
  };
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={handleClick}>Increment</button>
      <h3>This is a client component.</h3>
    </div>
  );
};
