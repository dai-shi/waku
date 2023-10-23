/// <reference types="react-dom/canary" />

"use client";

// @ts-expect-error no exported member
import { useFormState } from "react-dom";

export const Counter = ({
  increment,
}: {
  increment: (count: number) => Promise<number>;
}) => {
  const [count, dispatch] = useFormState(increment, 0);
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <form>
        <p>Count: {count}</p>
        <button formAction={dispatch}>Increment</button>
      </form>
      <h3>This is a client component.</h3>
    </div>
  );
};
