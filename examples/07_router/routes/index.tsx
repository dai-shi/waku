import { ReactNode } from "react";

export default ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h1>Index</h1>
      {children}
    </div>
  );
};
