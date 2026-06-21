import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <section>
      <p data-testid="count">Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </section>
  );
}
