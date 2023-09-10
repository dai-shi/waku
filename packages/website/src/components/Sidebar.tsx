import { SidebarGroup } from "./SidebarGroup.js";
import { SidebarItem } from "./SidebarItem.js";

export const Sidebar = ({ path }: { path: string }) => (
  <aside className="md:sticky md:top-10 flex flex-col gap-2">
    <SidebarItem
      selected={path === "/docs/introduction"}
      link="/docs/introduction"
      text="Introduction"
    />
    <SidebarItem
      selected={path === "/docs/installing"}
      link="/docs/installing"
      text="Installing"
    />
    <SidebarGroup text="Practices">
      <SidebarItem
        selected={path === "/docs/practices/minimal"}
        link="/docs/practices/minimal"
        text="Minimal"
      />
      <SidebarItem
        selected={path === "/docs/practices/router"}
        link="/docs/practices/router"
        text="Router"
      />
    </SidebarGroup>
  </aside>
);
