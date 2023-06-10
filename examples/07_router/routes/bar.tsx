import { ReactNode } from "react";

import { Counter } from "../src/Counter.js";

const Bar = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Bar</h2>
    <Counter />
    {children}
  </div>
);

export default Bar;
