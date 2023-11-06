import { Button } from "../components/Button.js";
import { IconGithub } from "../components/IconGithub.js";
import { IconChevronRight } from "../components/IconChevronRight.js";
import { IconArrowDown } from "../components/IconArrowDown.js";

export default function Page() {
  return (
    <div className="grow flex flex-col gap-16 justify-center items-center">
      <div className="flex flex-col gap-8 items-center">
        {/* hero text */}
        <div className="flex flex-col gap-0 text-4xl font-extrabold items-start md:items-center">
          <h1>⛩️ The minimal</h1>
          <h1 className="text-cCarmine">React framework</h1>
          <h1>with Server Components</h1>
        </div>

        {/* buttons */}
        <div className="flex flex-col md:flex-row gap-4 text-xl">
          <Button
            text="Contribute"
            href="https://github.com/dai-shi/waku"
            icon={<IconGithub />}
            variant="secondary"
          />

          <Button
            text="Get Started"
            href="/docs/introduction"
            icon={<IconChevronRight />}
            variant="primary"
          />
        </div>
      </div>

      {/* arrow */}
      <div className="rounded-full text-cBlack animate-pulse">
        <IconArrowDown />
      </div>
    </div>
  );
}
