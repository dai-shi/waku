'use client';

import { useState } from 'react';
import { useRefetch } from 'waku/minimal/client';

import { ClientBox } from './Box.js';

export const ClientCounter = () => {
  const [count, setCount] = useState(0);
  const refetch = useRefetch();
  return (
    <ClientBox data-testid="client-counter">
      <p data-testid="count">{count}</p>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <button data-testid="refetch1" onClick={() => refetch('foo')}>
        Refetch1
      </button>
      <button data-testid="refetch2" onClick={() => refetch('[bar]')}>
        Refetch2
      </button>
      <button data-testid="refetch3" onClick={() => refetch('baz/qux')}>
        Refetch3
      </button>
    </ClientBox>
  );
};
