'use client';

import { useState } from 'react'; // eslint-disable-line import/no-unresolved

export const Counter = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => setCount((c) => c + 1);

  return (
    <section
      style={{
        borderColor: 'blue',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 4,
        marginTop: 16,
        padding: 16,
        marginLeft: -16,
        marginRight: -16,
      }}
    >
      <div>Count: {count}</div>
      <button
        onClick={handleIncrement}
        style={{
          borderRadius: 4,
          padding: 8,
          backgroundColor: 'black',
          color: 'white',
          fontSize: 16,
        }}
      >
        Increment
      </button>
    </section>
  );
};
