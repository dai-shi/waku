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
  pathname: string,
  unstable_renderRSC: Parameters<GetBuildConfig>[0],
) => {
  const search = ""; // XXX this is a limitation
  const input = JSON.stringify(getInputObject(pathname, search));
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
  const input = JSON.stringify(getInputObject(pathname, search));
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
  getAllIds: () => Promise<string[]>,
): ReturnType<typeof defineEntries> {
  const renderSsrEntries = async (pathStr: string) => {
    const url = new URL(pathStr, "http://localhost");
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
    return { Root: element };
  };

  const SSR_PREFIX = "__SSR__";

  const renderEntries: RenderEntries = async (input) => {
    if (input.startsWith(SSR_PREFIX)) {
      return renderSsrEntries(input.slice(SSR_PREFIX.length));
    }
    const { routes, cached } = JSON.parse(input) as ReturnType<
      typeof getInputObject
    >;
    const allIds = await getAllIds();
    if (routes.some(([id]) => !allIds.includes(id))) {
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
    const allIds = await getAllIds();
    const path2moduleIds: Record<string, string[]> = {};
    for (const pathname of allIds) {
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
      allIds.map((pathname) => [
        pathname,
        { entries: prefetcher(pathname), customCode },
      ]),
    );
  };

  const getSsrConfig: GetSsrConfig = async () => {
    const allIds = await getAllIds();
    const isValidPath = (pathname: string) => {
      const componentIds = getComponentIds(pathname);
      return componentIds.every((id) => allIds.includes(id));
    };
    return {
      getInput: (pathStr) => {
        const url = new URL(pathStr, "http://localhost");
        if (isValidPath(url.pathname)) {
          return SSR_PREFIX + pathStr;
        }
        return null;
      },
      filter: (elements) => {
        return elements.Root;
      },
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
