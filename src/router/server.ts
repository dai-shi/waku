import { createElement } from "react";

import type { GetEntry, Prefetcher, Prerenderer } from "../server.js";

import { childReference, linkReference } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";

export function fileRouter(base: string) {
  const getEntry: GetEntry = async (id) => {
    // This can be too unsecure? FIXME
    const component = (await import(`${base}/${id}.js`)).default;
    const RouteComponent: any = (props: RouteProps) => {
      const componentProps: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(props.search)) {
        componentProps[key] = value;
      }
      return createElement(
        component,
        componentProps,
        createElement(childReference, { index: props.index + 1 })
      );
    };
    return RouteComponent;
  };

  const prefetcher: Prefetcher = async (path) => {
    const url = new URL(path || "", "http://localhost");
    const result: (readonly [id: string, props: RouteProps])[] = [];
    const pathItems = url.pathname.split("/").filter(Boolean);
    const search = url.search;
    for (let index = 0; index <= pathItems.length; ++index) {
      const rscId = pathItems.slice(0, index).join("/") || "index";
      result.push([rscId, { index, search }]);
    }
    return {
      entryItems: result,
      clientModules: [], // TODO we should analyze or dry-run to get clientModules
    };
  };

  const prerenderer: Prerenderer = async () => {
    return {
      entryItems: [], // TODO support prerender
      paths: [], // TODO support prerender
    };
  };

  return { getEntry, prefetcher, prerenderer };
}

export function Link(props: LinkProps) {
  return createElement(linkReference, props);
}
