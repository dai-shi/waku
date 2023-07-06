import { IconWaku } from "./IconWaku.js";
import { MyLink } from "./MyLink.js";

export const Nav = () => {
  return (
    <nav className="px-6 md:px-16 py-4 flex gap-4 flex-row justify-between items-center">
      {/* logo */}
      <div className="w-8 h-8">
        <MyLink href="/">
          <IconWaku />
        </MyLink>
      </div>

      {/* pages */}
      <div className="flex flex-row gap-4 items-center font-bold">
        <MyLink href="/">
          <h1>Home</h1>
        </MyLink>
        <MyLink href="/docs/introduction">
          <h1>Docs</h1>
        </MyLink>
      </div>
    </nav>
  );
};
