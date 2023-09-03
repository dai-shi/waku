"use client";

import { useState } from "react";
import { Server, useRefetch } from "waku/client";

export const Counter = ({ enableInnerApp = false }) => {
  const [count, setCount] = useState(0);
  const refetch = useRefetch();
  const handleClick = () => {
    const nextCount = count + 1;
    setCount(nextCount);
    if (enableInnerApp) {
      refetch("InnerApp=" + nextCount);
    }
  };
  return (
    <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
      <p>Count: {count}</p>
      <button onClick={handleClick}>Increment</button>
      <h3>This is a client component.</h3>
      {enableInnerApp && <Server id="InnerApp" />}
    </div>
  );
};
