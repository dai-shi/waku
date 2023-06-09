import { Writable } from "node:stream";
import { createElement, Fragment } from "react";
import type { FunctionComponent } from "react";

import type { GetEntry, GetBuilder } from "../server.js";
import type { RouteProps, LinkProps } from "./common.js";
import { Child as ClientChild, Link as ClientLink } from "./client.js";

const collectClientModules = async (
  pathStr: string,
  unstable_renderRSC: Parameters<GetBuilder>[1]
) => {
  const url = new URL(pathStr, "http://localhost");
  const pathItems = url.pathname.split("/").filter(Boolean);
  const search = url.search;
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    const props: RouteProps =
      index < pathItems.length ? { childIndex: index + 1 } : { search };
    const pipeable = await unstable_renderRSC({ rscId, props }, (id) =>
      idSet.add(id)
    );
    await new Promise<void>((resolve, reject) => {
      const stream = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
      stream.on("finish", resolve);
      stream.on("error", reject);
      pipeable.pipe(stream);
    });
  }
  return Array.from(idSet);
};

// We have to make prefetcher consistent with client behavior
const prefetcher = (pathStr: string) => {
  const url = new URL(pathStr, "http://localhost");
  const pathItems = url.pathname.split("/").filter(Boolean);
  const search = url.search;
  const elementSet = new Set<readonly [id: string, props: RouteProps]>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    const props: RouteProps =
      index < pathItems.length ? { childIndex: index + 1 } : { search };
    elementSet.add([rscId, props]);
  }
  return Array.from(elementSet);
};

export function defineRouter(
  getComponent: (
    id: string
  ) => Promise<FunctionComponent | { default: FunctionComponent } | null>,
  getAllPaths: (root: string) => Promise<string[]>
): { getEntry: GetEntry; getBuilder: GetBuilder } {
  const getEntry = async (id: string) => {
    const mod = await getComponent(id);
    const component =
      typeof mod === "function" ? mod : mod?.default || Fragment;
    const RouteComponent: FunctionComponent<any> = (props: RouteProps) => {
      const componentProps: Record<string, string> = {};
      if ("search" in props) {
        for (const [key, value] of new URLSearchParams(props.search)) {
          componentProps[key] = value;
        }
      }
      return createElement(
        component,
        componentProps,
        "childIndex" in props
          ? createElement(ClientChild, { index: props.childIndex })
          : null
      );
    };
    return RouteComponent;
  };

  const getBuilder: GetBuilder = async (root, unstable_renderRSC) => {
    const paths = (await getAllPaths(root)).map((item) =>
      item === "index" ? "/" : `/${item}`
    );
    const path2moduleIds: Record<string, string[]> = {};
    for (const pathStr of paths) {
      const moduleIds = await collectClientModules(pathStr, unstable_renderRSC);
      path2moduleIds[pathStr] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = search ? pathname + "?" + search : pathname;
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path]) {
    import(id);
  }
};`;
    return Object.fromEntries(
      paths.map((pathStr) => [
        pathStr,
        { elements: prefetcher(pathStr), customCode },
      ])
    );
  };

  return { getEntry, getBuilder };
}

export function Link(props: LinkProps) {
  return createElement(ClientLink, props);
}
