import { MyLink } from "./MyLink.js";

export const Sidebar = () => (
  <aside className="h-full sticky top-10">
    <ul className="pt-2 font-medium">
      <li className="h-12">
        <MyLink href="/docs/introduction" name="Introduction" />
      </li>
      <li className="h-12">
        <MyLink href="/docs/installing" name="Installing" />
      </li>
      <li className="h-12 text-gray-400">
        <span className="">Practices</span>
      </li>
      <li className="h-12">
        <MyLink href="/docs/practices/minimal" name="Minimal" />
      </li>
      <li className="h-12">
        <MyLink href="/docs/practices/router" name="Router" />
      </li>
    </ul>
  </aside>
);
