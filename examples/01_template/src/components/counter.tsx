'use client';

import { useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => setCount((c) => c + 1);

  return (
    <section className="border-green-400 bg-red -mx-4 mt-6 rounded border border-dashed p-4">
      <div>Count1: {count}</div>
      <button
        onClick={handleIncrement}
        className="rounded-sm bg-black px-2 py-0.5 text-sm text-white"
      >
        Increment
      </button>
    </section>
  );
};
