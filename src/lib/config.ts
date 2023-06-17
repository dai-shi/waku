import { resolveConfig as viteResolveConfig } from "vite";

import type { FrameworkConfig } from "../config.js";

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;

const splitHTML = (htmlStr: string): readonly [string, string] => {
  const splitted = htmlStr.split(/<div id="root">[^\n]*<\/div>/, 2);
  if (splitted.length !== 2) {
    throw new Error("Failed to split HTML");
  }
  return [splitted[0] + '<div id="root">', "</div>" + splitted[1]];
};

const getFallback = () => "waku/server#ClientFallback";

export const configFileConfig = process.env.CONFIG_FILE
  ? { configFile: process.env.CONFIG_FILE }
  : {};

export async function resolveConfig(command: "build" | "serve") {
  const origConfig = await viteResolveConfig(configFileConfig, command);
  const origFramework = (origConfig as { framework?: FrameworkConfig })
    .framework;
  const framework: DeepRequired<FrameworkConfig> = {
    indexHtml: "index.html",
    entriesJs: "entries.js",
    outPublic: "public",
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
