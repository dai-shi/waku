"use client";

import { useState, useTransition } from "react";

export const Counter = ({ increment }: { increment: () => void }) => {
  const [count, setCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    startTransition(() => {
      increment();
    });
  };
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p>
        <button onClick={handleClick}>Increment server counter</button>{" "}
        {isPending ? "Pending..." : ""}
      </p>
      <h3>This is a client component.</h3>
    </div>
  );
};
