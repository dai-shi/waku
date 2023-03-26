import { ReactNode } from "react";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h2>Nested</h2>
      {children}
    </div>
  );
};
