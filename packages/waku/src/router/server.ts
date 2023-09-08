import { Writable } from "node:stream";
import { createElement, Fragment, Suspense } from "react";
import type { FunctionComponent, ReactNode } from "react";

import { defineEntries } from "../server.js";
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from "../server.js";
import { Children } from "../client.js";
import { getComponentIds, getInputObject } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";
import { Waku_SSR_Capable_Link } from "./client.js";

const childrenElement = createElement(Children);

const collectClientModules = async (
  pathStr: string,
  unstable_renderRSC: Parameters<GetBuildConfig>[0],
) => {
  const url = new URL(pathStr, "http://localhost");
  const input = JSON.stringify(getInputObject(url.pathname, url.search));
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
const prefetcher = (pathStr: string) => {
  const url = new URL(pathStr, "http://localhost");
  const input = JSON.stringify(getInputObject(url.pathname, url.search));
  return [[input]] as const;
};

export type FunctionComponentWithAreEqual = FunctionComponent & {
  areEqual?: (prevProps: any, nextProps: any) => boolean;
};

export function defineRouter(
  getComponent: (
    componentId: string,
  ) => Promise<
    | FunctionComponentWithAreEqual
    | { default: FunctionComponentWithAreEqual }
    | null
  >,
  getAllPaths: () => Promise<string[]>,
): ReturnType<typeof defineEntries> {
  const isValidPath = async (pathname: string) => {
    const componentIds = getComponentIds(pathname);
    const allPaths = await getAllPaths();
    return componentIds.every((id) => allPaths.includes(id));
  };

  const renderSsrEntries = async (input: string) => {
    const url = new URL(input, "http://localhost");
    const componentIds = getComponentIds(url.pathname);
    const components = await Promise.all(
      componentIds.map(async (id) => {
        const mod = await getComponent(id);
        const component =
          typeof mod === "function" ? mod : mod?.default || Fragment;
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
    return { _ssr: element };
  };

  const renderEntries: RenderEntries = async (input, options) => {
    if (options.ssr) {
      return renderSsrEntries(input);
    }
    const { routes, cached } = JSON.parse(input) as ReturnType<
      typeof getInputObject
    >;
    const allPaths = await getAllPaths();
    if (routes.some(([id]) => !allPaths.includes(id))) {
      return null;
    }
    const entries = await Promise.all(
      routes.map(async ([id, props]) => {
        const mod = await getComponent(id);
        const component =
          typeof mod === "function" ? mod : mod?.default || Fragment;
        const cachedProps = cached?.[id];
        if (
          cachedProps &&
          (component as FunctionComponentWithAreEqual).areEqual?.(
            cachedProps,
            props,
          )
        ) {
          return null;
        }
        const element = createElement(
          component as FunctionComponent<RouteProps>,
          props,
          childrenElement,
        );
        return [id, element] as const;
      }),
    );
    return Object.fromEntries(
      entries.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null,
      ),
    );
  };

  const getBuildConfig: GetBuildConfig = async (unstable_renderRSC) => {
    const allPaths = await getAllPaths();
    const path2moduleIds: Record<string, string[]> = {};
    for (const pathStr of allPaths) {
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
      allPaths.map((pathStr) => [
        pathStr,
        { entries: prefetcher(pathStr), customCode },
      ]),
    );
  };

  const getSsrConfig: GetSsrConfig = async (pathStr) => {
    const url = new URL(pathStr, "http://localhost");
    if (await isValidPath(url.pathname)) {
      return { input: pathStr };
    }
    return null;
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
