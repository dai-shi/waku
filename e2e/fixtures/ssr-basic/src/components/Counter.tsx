'use client';

import { useId, useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);
  const id = useId();
  return (
    <div
      data-testid="counter"
      style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}
    >
      <p data-testid="count">{count}</p>
      <button
        id={id}
        data-testid="increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </div>
  );
};
