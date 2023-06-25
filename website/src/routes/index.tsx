import type { ReactNode } from "react";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { Button } from "../components/Button.js";
import { IconGithub } from "../components/IconGithub.js";
import { IconChevronRight } from "../components/IconChevronRight.js";
import { IconArrowDown } from "../components/IconArrowDown.js";

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
          icon={<IconChevronRight />}
          variant="primary"
        />

        <Button
          text="Contribute"
          href="https://github.com/dai-shi/waku"
          icon={<IconGithub />}
          variant="secondary"
        />
      </div>
    </div>

    {/* arrow */}
    <div className="rounded-full border border-cBlack text-cBlack p-4 animate-pulse">
      <IconArrowDown />
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
