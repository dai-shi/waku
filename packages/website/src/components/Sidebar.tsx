import { SidebarGroup } from "./SidebarGroup.js";
import { SidebarItem } from "./SidebarItem.js";

export const Sidebar = () => (
  <aside className="md:sticky md:top-10 flex flex-col gap-2">
    <SidebarItem
      selected={true}
      link="/docs/introduction"
      text="Introduction"
    />
    <SidebarItem link="/docs/installing" text="Installing" />
    <SidebarGroup text="Practices">
      <SidebarItem link="/docs/practices/minimal" text="Minimal" />
      <SidebarItem link="/docs/practices/router" text="Router" />
    </SidebarGroup>
  </aside>
);
