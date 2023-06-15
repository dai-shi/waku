import type { ReactNode } from "react";

import { Counter } from "../src/Counter.js";

const Nested = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Nested</h2>
    <Counter />
    {children}
  </div>
);

export default Nested;
