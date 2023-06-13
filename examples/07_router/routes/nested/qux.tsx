import type { ReactNode } from "react";

const Qux = ({ children }: { children: ReactNode }) => (
  <div>
    <h3>Qux</h3>
    {children}
  </div>
);

export default Qux;
