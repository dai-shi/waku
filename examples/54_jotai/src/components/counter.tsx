'use client';

import { atom, useAtom } from 'jotai';

export const countAtom = atom(0);

export const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
    </div>
  );
};
