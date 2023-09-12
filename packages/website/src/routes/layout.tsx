import type { ReactNode } from "react";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-cWhite text-cBlack gap-12 md:gap-8 pattern">
      <Nav></Nav>
      <main className="grow px-6 md:px-16 flex">{children}</main>
      <Footer></Footer>
    </div>
  );
}
