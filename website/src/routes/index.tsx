import type { ReactNode } from "react";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";

const Home = () => (
  <div className="grow flex flex-col gap-16 justify-center items-center">
    <div className="flex flex-col gap-0 text-4xl font-extrabold items-center">
      <h1>The Minimalist</h1>
      <h1 className="text-cCarmine">React Framework</h1>
      <h1>With Server Components</h1>
    </div>

    <div className="flex flex-row gap-4 text-xl">
      <button className="rounded-full px-4 py-1 border border-cBlack text-cBlack">
        Contribute
      </button>
      <button className="rounded-full px-4 py-1 border border-cBlack bg-cCarmine text-cWhite">
        Get Started
      </button>
    </div>

    <div>Arrow</div>
  </div>
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen w-screen bg-cWhite text-cBlack gap-8">
      <Nav></Nav>
      <main className="grow px-8 flex">{children || <Home />}</main>
      <Footer></Footer>
    </div>
  );
}
