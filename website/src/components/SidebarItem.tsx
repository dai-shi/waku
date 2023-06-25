import { IconFile } from "./IconFile.js";
import { MyLink } from "./MyLink.js";

export function SidebarItem(props: {
  link: string;
  text: string;
  selected?: boolean;
}) {
  return (
    <MyLink href={props.link}>
      <div
        className={`flex gap-2 items-center px-4 py-1 rounded-2xl ${
          props.selected && "bg-cCarmine text-cWhite"
        }`}
      >
        <IconFile />
        <p>{props.text}</p>
      </div>
    </MyLink>
  );
}
