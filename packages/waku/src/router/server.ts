import { Writable } from "node:stream";
import { createElement, Suspense } from "react";
import type { FunctionComponent, ReactNode } from "react";

import { defineEntries } from "../server.js";
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from "../server.js";
import { Children } from "../client.js";
import { getComponentIds, getInputString, parseInputString } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";
import { Waku_SSR_Capable_Link } from "./client.js";

const collectClientModules = async (
  pathname: string,
  unstable_renderRSC: Parameters<GetBuildConfig>[0],
) => {
  const search = ""; // XXX this is a limitation
  const input = getInputString(pathname, search);
  const idSet = new Set<string>();
  const pipeable = await unstable_renderRSC(
    { input },
    { ssr: false, moduleIdCallback: (id) => idSet.add(id) },
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
  return Array.from(idSet);
};

// We have to make prefetcher consistent with client behavior
const prefetcher = (pathname: string) => {
  const search = ""; // XXX this is a limitation
  const input = getInputString(pathname, search);
  return [[input]] as const;
};

const Default = ({ children }: { children: ReactNode }) => children;

export function defineRouter(
  getComponent: (
    componentId: string,
  ) => Promise<FunctionComponent | { default: FunctionComponent } | null>,
  getAllPaths: () => Promise<string[]>,
): ReturnType<typeof defineEntries> {
  const renderSsrEntries = async (pathStr: string) => {
    const url = new URL(pathStr, "http://localhost");
    const componentIds = getComponentIds(url.pathname);
    const components = await Promise.all(
      componentIds.map(async (id) => {
        const mod = await getComponent(id);
        const component =
          typeof mod === "function" ? mod : mod?.default || Default;
        return component;
      }),
    );
    const element = components.reduceRight(
      (acc: ReactNode, component) =>
        createElement(
          component as FunctionComponent<RouteProps>,
          { path: url.pathname, search: url.search },
          acc,
        ),
      null,
    );
    return { Root: element };
  };

  const SSR_PREFIX = "__SSR__";

  const renderEntries: RenderEntries = async (input) => {
    if (input.startsWith(SSR_PREFIX)) {
      return renderSsrEntries(input.slice(SSR_PREFIX.length));
    }
    const { pathname, search, skip } = parseInputString(input);
    const componentIds = getComponentIds(pathname);
    const allPaths = await getAllPaths(); // XXX this is a bit costly
    if (!allPaths.includes(pathname)) {
      return null;
    }
    const props: RouteProps = { path: pathname, search };
    const entries = (
      await Promise.all(
        componentIds.map(async (id) => {
          if (skip?.includes(id)) {
            return [];
          }
          const mod = await getComponent(id);
          const component =
            typeof mod === "function" ? mod : mod?.default || Default;
          const element = createElement(
            component as FunctionComponent<RouteProps>,
            props,
            createElement(Children),
          );
          return [[id, element]] as const;
        }),
      )
    ).flat();
    return Object.fromEntries(entries);
  };

  const getBuildConfig: GetBuildConfig = async (unstable_renderRSC) => {
    const allPaths = await getAllPaths();
    const path2moduleIds: Record<string, string[]> = {};
    for (const pathname of allPaths) {
      const moduleIds = await collectClientModules(
        pathname,
        unstable_renderRSC,
      );
      path2moduleIds[pathname] = moduleIds;
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
      allPaths.map((pathname) => [
        pathname,
        { entries: prefetcher(pathname), customCode },
      ]),
    );
  };

  const getSsrConfig: GetSsrConfig = async () => {
    const allPaths = await getAllPaths();
    return {
      getInput: (pathStr) => {
        const url = new URL(pathStr, "http://localhost");
        if (allPaths.includes(url.pathname)) {
          return SSR_PREFIX + pathStr;
        }
        return null;
      },
      filter: (elements) => elements.Root,
    };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}

export function Link(props: LinkProps) {
  const fallback = createElement("a", { href: props.href }, props.children);
  return createElement(
    Suspense,
    { fallback },
    createElement(Waku_SSR_Capable_Link, props),
  );
}
