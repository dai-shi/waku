"use client";

import { useState } from "react";
import { mutate } from "wakuwork/client";

export const Counter = ({ increment }: { increment: () => void }) => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p>
        <button onClick={() => mutate(() => increment())}>
          Increment server counter
        </button>
      </p>
      <h3>This is a client component.</h3>
    </div>
  );
};
