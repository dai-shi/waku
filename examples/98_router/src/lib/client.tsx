"use client";

import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";

import { Root, Slot, useRefetch } from "waku/client";

import { RouteTree } from "./common.js";

const RouterContext = createContext<{
  setPath: (path: string) => void;
} | null>(null);

function InnerClientRouter() {
  const refetch = useRefetch();
  const setPath = useCallback(
    (path: string) => {
      refetch("_" + path);
    },
    [refetch],
  );
  return (
    <RouterContext.Provider value={{ setPath }}>
      <Slot id="App" />
    </RouterContext.Provider>
  );
}

export function ClientRouter(props: { rootTree: RouteTree }) {
  const initialPath = props.rootTree.root.path;
  return (
    <Root initialInput={"_" + initialPath}>
      <InnerClientRouter />
    </Root>
  );
}

export function Link(props: { to: string; children: ReactNode }) {
  const { setPath } = useContext(RouterContext)!;
  return <a onClick={() => setPath(props.to)}>{props.children}</a>;
}
