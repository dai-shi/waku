/// <reference types="react/experimental" />

"use client";

import { cache, use, useState } from "react";
import type { ReactNode } from "react";
import { createFromFetch } from "react-server-dom-webpack/client";

const fetchInnerApp = cache(
  async (count: number): Promise<ReactNode> =>
    createFromFetch(fetch(`/src/InnerApp?__RSC&count=${count}`))
);

export const Counter = ({ enableInnerApp = false }) => {
  const [count, setCount] = useState(0);
  const innerApp = enableInnerApp && use(fetchInnerApp(count));
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      {innerApp}
    </div>
  );
};
