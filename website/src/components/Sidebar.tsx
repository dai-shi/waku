import { MyLink } from "./MyLink.js";

export const Sidebar = () => (
  <aside className="h-full sticky top-20">
    <ul className="flex flex-col gap-4">
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/introduction" name="Introduction" />
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/installing" name="Installing" />
      </li>
      <li className="flex flex-row gap-2 items-center">
        <span className="">Practices</span>
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/practices/minimal" name="Minimal" />
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/practices/router" name="Router" />
      </li>
    </ul>
  </aside>
);
