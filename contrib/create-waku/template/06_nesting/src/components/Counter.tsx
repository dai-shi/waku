"use client";

import { useState } from "react";
import { serve } from "waku/client";

// XXX This is not recommended in practice
// as it can easily make client server waterfalls.
const InnerApp = serve<{ count: number }>("InnerApp");

export const Counter = ({ enableInnerApp = false }) => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      {enableInnerApp && <InnerApp count={count} />}
    </div>
  );
};
