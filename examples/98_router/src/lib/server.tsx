import { RouteTree } from "./common.js";

export function ServerRouter(props: { rootTree: RouteTree; path: string }) {
  const RootComponent = props.rootTree.root.component;
  const ChildComponent =
    props.rootTree.children.find((child) => child.path === props.path)
      ?.component ?? (() => null);
  return (
    <RootComponent>
      <ChildComponent />
    </RootComponent>
  );
}
