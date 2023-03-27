import { ReactNode } from "react";

import { Counter } from "../src/Counter.js";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h2>Nested</h2>
      <Counter />
      {children}
    </div>
  );
};
