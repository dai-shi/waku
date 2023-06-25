import { IconFolder } from "./IconFolder.js";

export function SidebarGroup(props: {
  text: string;
  children: JSX.Element | JSX.Element[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2 items-center px-4 py-1 rounded-2xl">
        <IconFolder />
        <h1>{props.text}</h1>
      </div>
      <div className="flex flex-col gap-2 ps-4">
        <>{props.children}</>
      </div>
    </div>
  );
}
