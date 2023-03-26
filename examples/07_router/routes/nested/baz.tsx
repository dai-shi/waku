import { ReactNode } from "react";

import { Counter } from "../../src/Counter.js";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h3>Baz</h3>
      <Counter />
      {children}
    </div>
  );
};
