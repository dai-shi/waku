import { Writable } from "node:stream";
import { createElement, Fragment, Suspense } from "react";
import type { FunctionComponent, ReactNode } from "react";

import { defineEntries } from "../server.js";
import type { GetEntry, GetBuildConfig, GetSsrConfig } from "../server.js";
import type { RouteProps, LinkProps } from "./common.js";
import { Child as ClientChild, Waku_SSR_Capable_Link } from "./client.js";

const collectClientModules = async (
  pathStr: string,
  unstable_renderRSC: Parameters<GetBuildConfig>[0],
) => {
  const url = new URL(pathStr, "http://localhost");
  const pathItems = url.pathname.split("/").filter(Boolean);
  const search = url.search;
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    const props: RouteProps =
      index < pathItems.length ? { childIndex: index + 1 } : { search };
    const pipeable = await unstable_renderRSC(
      { rscId, props },
      { moduleIdCallback: (id) => idSet.add(id) },
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
    id: string,
  ) => Promise<FunctionComponent | { default: FunctionComponent } | null>,
  getAllPaths: () => Promise<string[]>,
): ReturnType<typeof defineEntries> {
  const SSR_PREFIX = "__SSR__";
  const getSsrEntry = async (pathname: string) => {
    // We need to keep the logic in sync with waku/router/client
    // FIXME We should probably create a common function
    const pathItems = pathname.split("/").filter(Boolean);
    const components: FunctionComponent[] = [];
    for (let index = 0; index <= pathItems.length; ++index) {
      const rscId = pathItems.slice(0, index).join("/") || "index";
      const mod = await getComponent(rscId); // FIXME should use Promise.all
      const component =
        typeof mod === "function" ? mod : mod?.default || Fragment;
      components.push(component);
    }
    const SsrComponent: FunctionComponent<any> = (props: {
      search: string;
    }) => {
      const componentProps: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(props.search)) {
        componentProps[key] = value;
      }
      return components.reduceRight(
        (acc: ReactNode, component, index) =>
          createElement(
            component,
            index === components.length - 1 ? componentProps : {},
            acc,
          ),
        null,
      );
    };
    return SsrComponent;
  };

  const getEntry: GetEntry = async (id) => {
    if (id.startsWith(SSR_PREFIX)) {
      return getSsrEntry(id.slice(SSR_PREFIX.length));
    }
    let mod: Awaited<ReturnType<typeof getComponent>>;
    try {
      mod = await getComponent(id);
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.startsWith("Unknown variable dynamic import")
      ) {
        return null;
      }
      throw e;
    }
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
          : null,
      );
    };
    return RouteComponent;
  };

  const getBuildConfig: GetBuildConfig = async (unstable_renderRSC) => {
    const paths = (await getAllPaths()).map((item) =>
      item === "index" ? "/" : `/${item}`,
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
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    return Object.fromEntries(
      paths.map((pathStr) => [
        pathStr,
        { elements: prefetcher(pathStr), customCode },
      ]),
    );
  };

  const getSsrConfig: GetSsrConfig = async (pathStr) => {
    const url = new URL(pathStr, "http://localhost");
    // We need to keep the logic in sync with waku/router/client
    // FIXME We should probably create a common function
    const pathItems = url.pathname.split("/").filter(Boolean);
    const rscId = pathItems.join("/") || "index";
    try {
      await getComponent(rscId);
    } catch (e) {
      // FIXME Is there a better way to check if the path exists?
      return null;
    }
    return { element: [SSR_PREFIX + url.pathname, { search: url.search }] };
  };

  return { getEntry, getBuildConfig, getSsrConfig };
}

export function Link(props: LinkProps) {
  const fallback = createElement("a", { href: props.href }, props.children);
  return createElement(
    Suspense,
    { fallback },
    createElement(Waku_SSR_Capable_Link, props),
  );
}
