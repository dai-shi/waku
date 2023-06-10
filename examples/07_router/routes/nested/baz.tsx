import { ReactNode } from "react";

const Baz = ({ children }: { children: ReactNode }) => (
  <div>
    <h3>Baz</h3>
    {children}
  </div>
);

export default Baz;
