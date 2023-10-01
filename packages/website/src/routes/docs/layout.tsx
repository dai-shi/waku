import { ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar.js";

export default function Layout({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-16 md:gap-8">
      <Sidebar path={path}></Sidebar>
      <div className="md:grow md:px-12">{children}</div>
      <p>Current Date: {new Date().toISOString()}</p>
    </div>
  );
}
