/// <reference types="react/experimental" />

"use client";

import { cache, use, useState } from "react";
import type { ReactNode } from "react";
import { serve } from "wakuwork";

import InnerApp from "./InnerApp.tsx";

export const Counter = ({ enableInnerApp = false }) => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      {enableInnerApp && <ShowInnerApp count={count} />}
    </div>
  );
};

const fetchInnerApp = cache(async (count: number): Promise<ReactNode> => {
  await new Promise((r) => setTimeout(r, 1000)); // emulate slow network
  return serve(InnerApp)({ count });
});

const ShowInnerApp = ({ count }: { count: number }) => (
  <>{use(fetchInnerApp(count))}</>
);
