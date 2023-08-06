"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

import { serve } from "waku/client";

import { RouteTree } from "./common.js";

const RouterContext = createContext<{
  setPath: (path: string) => void;
} | null>(null);

const App = serve<{ path: string }>("App");

export function ClientRouter(props: { rootTree: RouteTree }) {
  const initialPath = props.rootTree.root.path;
  const [path, setPath] = useState(initialPath);
  return (
    <RouterContext.Provider value={{ setPath }}>
      <App path={path} />
    </RouterContext.Provider>
  );
}

export function Link(props: { to: string; children: ReactNode }) {
  const { setPath } = useContext(RouterContext)!;
  return <a onClick={() => setPath(props.to)}>{props.children}</a>;
}
