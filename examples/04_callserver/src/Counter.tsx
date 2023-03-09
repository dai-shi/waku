"use client";

import { useState } from "react";

export const Counter = ({
  greet,
}: {
  greet: (name: string) => string | Promise<string>;
}) => {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p>
        <button
          onClick={() =>
            Promise.resolve(greet("client:" + count)).then(setText)
          }
        >
          greet("client:" + count) = {text}
        </button>
      </p>
      <h3>This is a client component.</h3>
    </div>
  );
};
