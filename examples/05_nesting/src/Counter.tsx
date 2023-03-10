/// <reference types="react/experimental" />

"use client";

import { Suspense, cache, use, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { createFromFetch } from "react-server-dom-webpack/client";

export const Counter = ({ enableInnerApp = false }) => {
  const [count, setCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inc = () => {
    startTransition(() => {
      setCount((c) => c + 1);
    });
  };
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={inc}>Increment</button>
      {isPending && <span>Pending...</span>}
      <h3>This is a client component.</h3>
      {enableInnerApp && (
        <Suspense fallback="Pending...">
          <InnerApp count={count} />
        </Suspense>
      )}
    </div>
  );
};

const fetchInnerApp = cache(async (count: number): Promise<ReactNode> => {
  await new Promise((r) => setTimeout(r, 1000)); // emulate slow network
  return createFromFetch(fetch(`/RSC/InnerApp?count=${count}`));
});

const InnerApp = ({ count }: { count: number }) => (
  <>{use(fetchInnerApp(count))}</>
);
