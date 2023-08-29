import { ReactNode } from "react";
import { Sidebar } from "../components/Sidebar.js";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-16 md:gap-8">
      <Sidebar></Sidebar>
      <div className="md:grow md:px-12">{children}</div>
    </div>
  );
}
