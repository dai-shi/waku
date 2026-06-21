'use client';

import { useMemo, useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  const label = useMemo(() => `Count: ${count}`, [count]);
  return (
    <section>
      <p data-testid="count">{label}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </section>
  );
}
