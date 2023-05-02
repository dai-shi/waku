import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h2>Introduction</h2>
      {children}
    </div>
  );
}
