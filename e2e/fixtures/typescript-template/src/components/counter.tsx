'use client';

import { useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <section className="grid gap-3" aria-label="counter">
      <p data-testid="count">Count: {count}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </section>
  );
};
