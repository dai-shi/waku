export function SidebarGroup(props: {
	text: string;
	children: JSX.Element | JSX.Element[];
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-row justify-between items-center px-4 py-1 rounded-2xl">
				<h1>{props.text}</h1>
				<p>˃</p>
			</div>
			<div className="flex flex-col gap-2 ps-4">
				<>{props.children}</>
			</div>
		</div>
	);
}
