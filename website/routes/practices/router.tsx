import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode })  {
  return (
    <div>
      <h2>Router Practice</h2>
      {children}
    </div>
  );
};
