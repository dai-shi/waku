import { createElement } from "react";

import type { GetEntry, Prefetcher } from "../server.js";

import { childrenWrapperReference } from "./common.js";
import type { RouteProps } from "./common.js";

export function fileRouter(base: string) {
  const getEntry: GetEntry = async (id) => {
    // This can be too unsecure? FIXME
    const component = (await import(`${base}/${id}.js`)).default;
    const RouteComponent: any = (props: RouteProps) => {
      const componentProps: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(props.searchParams)) {
        componentProps[key] = value;
      }
      const pathItems = props.pathname.split("/").filter(Boolean);
      if (pathItems.length > props.index) {
        return createElement(
          component,
          componentProps,
          createElement(childrenWrapperReference, {
            ...props,
            index: props.index + 1,
          })
        );
      }
      return createElement(component, componentProps);
    };
    return RouteComponent;
  };

  const prefetcher: Prefetcher = async (pathname) => {
    const result: (readonly [id: string, props: RouteProps])[] = [];
    const pathItems = pathname.split("/").filter(Boolean);
    // Hmm, we can't get searchParams. Use empty string for now. FIXME
    const searchParams = "";
    for (let index = 0; index <= pathItems.length; ++index) {
      result.push([
        pathItems.slice(0, index).join("/") || "index",
        {
          pathname,
          index,
          searchParams,
        },
      ]);
    }
    return result;
  };

  return { getEntry, prefetcher };
}
