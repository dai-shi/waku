import fs from "node:fs";
import path from "node:path";
import { resolveConfig as viteResolveConfig } from "vite";

import type { FrameworkConfig } from "../config.js";

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;

const splitHTML = (htmlStr: string): readonly [string, string, string] => {
  const P1 = [
    "<!--placeholder1-->\\s*<div[^>]*>",
    "</div>\\s*<!--/placeholder1-->",
  ] as const;
  const P2 = ["<!--placeholder2-->", "<!--/placeholder2-->"] as const;
  const anyRE = "[\\s\\S]*";
  const match = htmlStr.match(
    new RegExp(
      // prettier-ignore
      "^(" + anyRE + P1[0] + ")" + anyRE + "(" + P1[1] + anyRE + P2[0] + ")" + anyRE + "(" + P2[1] + anyRE + ")$"
    )
  );
  if (match?.length !== 1 + 3) {
    throw new Error("Failed to split HTML");
  }
  return match.slice(1) as [string, string, string];
};

const getFallback = (id: string) => {
  if (id.endsWith("#Waku_SSR_Capable_Link")) {
    return "waku/server#ClientOnly";
  }
  return "waku/server#ClientFallback";
};

export const configFileConfig = () => {
  if (process.env.CONFIG_FILE) {
    return { configFile: path.resolve(process.env.CONFIG_FILE) };
  }
  for (const file of ["vite.config.ts", "vite.config.js"]) {
    if (fs.existsSync(file)) {
      return { configFile: path.resolve(file) };
    }
  }
  return {};
};

export async function resolveConfig(command: "build" | "serve") {
  const origConfig = await viteResolveConfig(configFileConfig(), command);
  const origFramework = (origConfig as { framework?: FrameworkConfig })
    .framework;
  const framework: DeepRequired<FrameworkConfig> = {
    srcDir: "src",
    distDir: "dist",
    publicDir: "public",
    indexHtml: "index.html",
    entriesJs: "entries.js",
    rscPrefix: "RSC/",
    ...origFramework,
    ssr: {
      rscServer: "/",
      splitHTML,
      getFallback,
      ...origFramework?.ssr,
    },
  };
  const config = { ...origConfig, framework };
  return config;
}
