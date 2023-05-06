import path from "node:path";
import fs from "node:fs";
import { createElement } from "react";
import * as swc from "@swc/core";

import type { GetEntry, Prefetcher, Prerenderer } from "../server.js";

import { childReference, linkReference } from "./common.js";
import type { RouteProps, LinkProps } from "./common.js";

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

const resolveFileName = (fname: string) => {
  for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
    const resolvedName = fname.slice(0, -3) + ext;
    if (fs.existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  throw new Error(`Cannot resolve file ${fname}`);
};

const findDependentModules = (fname: string) => {
  fname = resolveFileName(fname);
  // TODO support ".js" and ".jsx"
  const mod = swc.parseFileSync(fname, {
    syntax: "typescript",
    tsx: fname.endsWith(".tsx"),
  });
  const modules: (readonly [fname: string, exportNames: string[]])[] = [];
  for (const item of mod.body) {
    if (
      item.type === "ImportDeclaration" &&
      item.source.type === "StringLiteral"
    ) {
      const name = item.source.value;
      if (name.startsWith(".")) {
        modules.push([
          path.join(path.dirname(fname), name),
          item.specifiers.map((specifier) => {
            if (specifier.type === "ImportSpecifier") {
              return specifier.local.value;
            }
            if (specifier.type === "ImportDefaultSpecifier") {
              return "default";
            }
            throw new Error(`Unknown specifier type: ${specifier.type}`);
          }),
        ]);
      }
    }
  }
  return modules;
};

export function fileRouter(base: string) {
  const findClientModules = async (id: string) => {
    const fname = `${base}/${id}.js`;
    const modules = findDependentModules(fname);
    return (
      await Promise.all(
        modules.map(async ([fname, exportNames]) => {
          const m = await import(fname);
          return exportNames.flatMap((name) => {
            if (m[name]?.["$$typeof"] === CLIENT_REFERENCE) {
              return [m[name]];
            }
            return [];
          });
        })
      )
    ).flat();
  };

  const getAllPaths = (dir = ""): string[] =>
    fs
      .readdirSync(path.join(base, dir), { withFileTypes: true })
      .flatMap((dirent) => {
        if (dirent.isDirectory()) {
          return getAllPaths(path.join(dir, dirent.name));
        }
        const fname = path.join(dir, path.parse(dirent.name).name);
        const stat = fs.statSync(path.join(base, fname), {
          throwIfNoEntry: false,
        });
        if (stat?.isDirectory()) {
          return [fname + "/"];
        }
        return [fname];
      });

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
        props.childIndex
          ? createElement(childReference, { index: props.childIndex })
          : null
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
      result.push([
        rscId,
        index < pathItems.length
          ? { childIndex: index + 1, search }
          : { search },
      ]);
    }
    const clientModules = new Set(
      (
        await Promise.all(result.map(([rscId]) => findClientModules(rscId)))
      ).flat()
    );
    return {
      entryItems: result,
      clientModules,
    };
  };

  const prerenderer: Prerenderer = async () => {
    const paths = getAllPaths().map((item) =>
      item === "index" ? "/" : `/${item}`
    );
    const prefetcherForPaths = await Promise.all(paths.map(prefetcher));
    const unstable_customCode = (
      _path: string,
      decodeId: (encodedId: string) => [id: string, name: string]
    ) => `
globalThis.__WAKUWORK_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = search ? pathname + "?" + search : pathname;
  const path2ids = {${paths.map((pathItem, index) => {
    const moduleIds: string[] = [];
    for (const m of prefetcherForPaths[index]?.clientModules as any[]) {
      if (m["$$typeof"] !== CLIENT_REFERENCE) {
        throw new Error("clientModules must be client references");
      }
      const [id] = decodeId(m["$$id"]);
      moduleIds.push(id);
    }
    return `
    ${JSON.stringify(pathItem)}: ${JSON.stringify(moduleIds)}`;
  })}
  };
  for (const id of path2ids[path]) {
    import(id);
  }
};`;
    return {
      entryItems: Array.from(prefetcherForPaths.values()).flatMap((item) =>
        Array.from(item.entryItems || [])
      ),
      paths,
      unstable_customCode,
    };
  };

  return { getEntry, prefetcher, prerenderer };
}

export function Link(props: LinkProps) {
  return createElement(linkReference, props);
}
