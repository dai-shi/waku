import type { ReactNode } from "react";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { Button } from "../components/Button.js";

const Home = () => (
  <div className="grow flex flex-col gap-16 justify-center items-center">
    <div className="flex flex-col gap-8 items-center">
      {/* hero text */}
      <div className="flex flex-col gap-0 text-4xl font-extrabold items-center">
        <h1>The Minimalist</h1>
        <h1 className="text-cCarmine">React Framework</h1>
        <h1>With Server Components</h1>
      </div>

      {/* buttons */}
      <div className="flex flex-row gap-4 text-xl">
        <Button
          text="Get Started"
          href="/docs/introduction"
          icon=""
          variant="primary"
        />

        <Button
          text="Contribute"
          href="https://github.com/dai-shi/waku"
          icon=""
          variant="secondary"
        />
      </div>
    </div>

    {/* arrow */}
    <div className="rounded-full border border-cBlack text-cBlack p-4 animate-pulse">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 256 256"
      >
        <path
          fill="currentColor"
          d="m204.24 148.24l-72 72a6 6 0 0 1-8.48 0l-72-72a6 6 0 0 1 8.48-8.48L122 201.51V40a6 6 0 0 1 12 0v161.51l61.76-61.75a6 6 0 0 1 8.48 8.48Z"
        />
      </svg>
    </div>
  </div>
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen w-screen bg-cWhite text-cBlack gap-8 pattern">
      <Nav></Nav>
      <main className="grow px-8 flex">{children || <Home />}</main>
      <Footer></Footer>
    </div>
  );
}
