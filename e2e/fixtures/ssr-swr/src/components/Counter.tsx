'use client';

import { useState } from 'react';
import useSWR from 'swr';

const fetcher = () => ({ name: 'Waku' });

export const Counter = () => {
  const [count, setCount] = useState(0);
  const { data } = useSWR('/api/user', fetcher);
  return (
    <div
      data-testid="counter"
      style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}
    >
      <p data-testid="count">{count}</p>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p data-testid="swr-data">{JSON.stringify(data)}</p>
    </div>
  );
};
