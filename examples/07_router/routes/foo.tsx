import type { ReactNode } from "react";

import { Counter } from "../components/Counter.js";

const Foo = ({ children }: { children: ReactNode }) => (
  <div>
    <h2>Foo</h2>
    <Counter />
    {children}
  </div>
);

export default Foo;
