import type { ReactNode } from "react";

import { Counter } from "./Counter.js";

const InnerApp = ({
  count,
  children,
}: {
  count: number;
  children?: ReactNode;
}) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h3>This is another server component.</h3>
      <p>The outer count is {count}.</p>
      {children || <Counter />}
    </div>
  );
};

export default InnerApp;
