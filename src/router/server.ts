import path from "node:path";
import fs from "node:fs";
import { createElement } from "react";
import * as swc from "@swc/core";

import type { GetEntry, GetBuilder, unstable_GetCustomModules } from "../server.js";

import type { RouteProps, LinkProps } from "./common.js";
import { Child as ClientChild, Link as ClientLink } from "./client.js";

const getAllFiles = (base: string, parent = ""): string[] =>
  fs
    .readdirSync(path.join(base, parent), { withFileTypes: true })
    .flatMap((dirent) => {
      if (dirent.isDirectory()) {
        return getAllFiles(base, path.join(parent, dirent.name));
      }
      const fname = path.join(parent, dirent.name);
      return [fname];
    });

const getAllPaths = (base: string, parent = ""): string[] =>
  fs
    .readdirSync(path.join(base, parent), { withFileTypes: true })
    .flatMap((dirent) => {
      if (dirent.isDirectory()) {
        return getAllPaths(base, path.join(parent, dirent.name));
      }
      const fname = path.join(parent, path.parse(dirent.name).name);
      const stat = fs.statSync(path.join(base, fname), {
        throwIfNoEntry: false,
      });
      if (stat?.isDirectory()) {
        return [fname + "/"];
      }
      return [fname];
    });

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

// XXX Can we avoid doing this here?
const findDependentModules = (fname: string) => {
  fname = resolveFileName(fname);
  const ext = path.extname(fname);
  const mod = swc.parseFileSync(fname, {
    syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
    tsx: ext === ".tsx",
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

const findClientModules = async (base: string, id: string) => {
  const fname = `${base}/${id}.js`;
  const modules = findDependentModules(fname);
  return (
    await Promise.all(
      modules.map(async ([fname, exportNames]) => {
        const m = await import(/* @vite-ignore */ fname);
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

export function fileRouter(baseDir: string, routesPath: string) {
  const base = path.join(baseDir, routesPath);
  const getEntry: GetEntry = async (id) => {
    // This can be too unsecure? FIXME
    const component = (await import(/* @vite-ignore */ `${base}/${id}.js`))
      .default;
    const RouteComponent: any = (props: RouteProps) => {
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

  // We have to make prefetcher consistent with client behavior
  const prefetcher = async (pathStr: string) => {
    const url = new URL(pathStr, "http://localhost");
    const elements: (readonly [id: string, props: RouteProps])[] = [];
    const pathItems = url.pathname.split("/").filter(Boolean);
    const search = url.search;
    for (let index = 0; index <= pathItems.length; ++index) {
      const rscId = pathItems.slice(0, index).join("/") || "index";
      elements.push([
        rscId,
        index < pathItems.length ? { childIndex: index + 1 } : { search },
      ]);
    }
    const clientModules = new Set(
      (
        await Promise.all(
          elements.map(([rscId]) => findClientModules(base, rscId))
        )
      ).flat()
    );
    return { elements, clientModules };
  };

  const getBuilder: GetBuilder = async (
    decodeId: (encodedId: string) => [id: string, name: string]
  ) => {
    const paths = getAllPaths(base).map((item) =>
      item === "index" ? "/" : `/${item}`
    );
    const prefetcherForPaths = await Promise.all(paths.map(prefetcher));
    const customCode = `
globalThis.__WAKUWORK_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = search ? pathname + "?" + search : pathname;
  const path2ids = {${paths.map((pathItem, index) => {
    const moduleIds: string[] = [];
    for (const m of prefetcherForPaths[index]?.clientModules || []) {
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
    return Object.fromEntries(
      paths.map((pathStr, index) => {
        return [
          pathStr,
          {
            elements: prefetcherForPaths[index]?.elements || [],
            customCode,
          },
        ];
      })
    );
  };

  const unstable_getCustomModules: unstable_GetCustomModules = async () => {
    return Object.fromEntries(
      getAllFiles(base).map((file) => [
        `${routesPath}/${file.replace(/\.\w+$/, "")}`,
        `${base}/${file}`,
      ])
    );
  };

  return { getEntry, getBuilder, unstable_getCustomModules };
}

export function Link(props: LinkProps) {
  return createElement(ClientLink, props);
}
