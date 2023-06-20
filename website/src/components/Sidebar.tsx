import { MyLink } from "./MyLink.js";

export const Sidebar = () => (
  <aside className="h-full sticky top-10">
    <ul className="flex flex-col gap-4">
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/introduction">
          <p>Introduction</p>
        </MyLink>
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/installing">
          <p>Installing</p>
        </MyLink>
      </li>
      <li className="flex flex-row gap-2 items-center">
        <span className="">Practices</span>
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/practices/minimal">
          <span>Minimal</span>
        </MyLink>
      </li>
      <li className="flex flex-row gap-2 items-center">
        <MyLink href="/docs/practices/router">
          <span>Router</span>
        </MyLink>
      </li>
    </ul>
  </aside>
);
