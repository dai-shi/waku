"use client";

import { useState, useTransition } from "react";

export const Counter = ({
  greet,
}: {
  greet: (name: string) => Promise<string>;
}) => {
  const [count, setCount] = useState(0);
  const [text, setText] = useState<string | Promise<string>>("");
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    startTransition(() => {
      setText(greet("c=" + count));
    });
  };
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p>
        <button onClick={handleClick}>
          greet(&quot;c=&quot; + count) = {text as string}
        </button>{" "}
        {isPending ? "Pending..." : ""}
      </p>
      <h3>This is a client component.</h3>
    </div>
  );
};
