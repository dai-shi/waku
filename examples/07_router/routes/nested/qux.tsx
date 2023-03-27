import { ReactNode } from "react";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h3>Qux</h3>
      {children}
    </div>
  );
};
