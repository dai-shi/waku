'use client';
import { useState } from 'react';
import { ClientBox } from './Box.js';

export const ClientCounter = () => {
  const [count, setCount] = useState(0);
  return (
    <ClientBox data-testid="client-counter">
      <p data-testid="count">{count}</p>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </ClientBox>
  );
};
