import { ReactNode } from "react";
import { Sidebar } from "../components/Sidebar.js";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-row gap-8">
      <Sidebar></Sidebar>
      <div className="grow px-12">{children}</div>
    </div>
  );
}
