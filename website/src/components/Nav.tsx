import { MyLink } from "./MyLink.js";

export const Nav = () => {
  return (
    <nav className="px-8 py-4 flex gap-4 flex-row justify-between items-center sticky top-0 bg-cWhite/80 backdrop-blur-md">
      {/* logo */}
      <div>
        <MyLink href="/">
          <h1 className="font-bold text-xl font-mono">Waku</h1>
        </MyLink>
      </div>

      {/* pages */}
      <div className="flex flex-row gap-4 items-center font-bold">
        <MyLink href="/">
          <h1>Home</h1>
        </MyLink>
        <MyLink href="/docs/">
          <h1>Docs</h1>
        </MyLink>
      </div>
    </nav>
  );
};
