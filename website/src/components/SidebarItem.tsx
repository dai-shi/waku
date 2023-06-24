import { MyLink } from "./MyLink.js";

export function SidebarItem(props: {
	link: string;
	text: string;
	selected?: boolean;
}) {
	return (
		<MyLink href={props.link}>
			<div
				className={`flex items-center px-4 py-1 rounded-2xl ${
					props.selected && "bg-cCarmine text-cWhite"
				}`}
			>
				<p>{props.text}</p>
			</div>
		</MyLink>
	);
}
