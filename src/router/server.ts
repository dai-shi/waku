import path from "node:path";
import fs from "node:fs";
import { createElement } from "react";
import * as swc from "@swc/core";

import type { GetEntry, GetBuilder } from "../server.js";

import type { RouteProps, LinkProps } from "./common.js";
import { Child as ClientChild, Link as ClientLink } from "./client.js";

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

const resolveFileName = (fname: string) => {
  for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
    const resolvedName =
      fname.slice(0, fname.length - path.extname(fname).length) + ext;
    if (fs.existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return "";
};

const isClientEntry = (fname: string) => {
  fname = resolveFileName(fname);
  const ext = path.extname(fname);
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    const mod = swc.parseFileSync(fname, {
      syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
      tsx: ext === ".tsx",
    });
    for (const item of mod.body) {
      if (
        item.type === "ExpressionStatement" &&
        item.expression.type === "StringLiteral" &&
        item.expression.value === "use client"
      ) {
        return true;
      }
    }
  }
  return false;
};

const collectClientFiles = (base: string, pathStr: string) => {
  const url = new URL(pathStr, "http://localhost");
  const pathItems = url.pathname.split("/").filter(Boolean);
  const fileSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    let fname = `${base}/${rscId}.js`;
    fname = resolveFileName(fname);
    if (!fname) {
      continue;
    }
    const ext = path.extname(fname);
    const mod = swc.parseFileSync(fname, {
      syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
      tsx: ext === ".tsx",
    });
    for (const item of mod.body) {
      if (
        item.type === "ImportDeclaration" &&
        item.source.type === "StringLiteral"
      ) {
        const name = item.source.value;
        if (name.startsWith(".")) {
          const file = path.join(path.dirname(fname), name);
          if (isClientEntry(file)) {
            fileSet.add(file);
          }
        }
      }
    }
  }
  return Array.from(fileSet);
};

// We have to make prefetcher consistent with client behavior
const prefetcher = (pathStr: string) => {
  const url = new URL(pathStr, "http://localhost");
  const pathItems = url.pathname.split("/").filter(Boolean);
  const search = url.search;
  const elementSet = new Set<readonly [id: string, props: RouteProps]>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const rscId = pathItems.slice(0, index).join("/") || "index";
    elementSet.add([
      rscId,
      index < pathItems.length ? { childIndex: index + 1 } : { search },
    ]);
  }
  return Array.from(elementSet);
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

  const getBuilder: GetBuilder = async (unstable_resolveClientEntry) => {
    const paths = getAllPaths(base).map((item) =>
      item === "index" ? "/" : `/${item}`
    );
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = {${paths.map((pathStr) => {
    const moduleIds = collectClientFiles(base, pathStr).map(
      unstable_resolveClientEntry
    );
    return `
    ${JSON.stringify(pathStr)}: ${JSON.stringify(moduleIds)}`;
  })}
  };
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
