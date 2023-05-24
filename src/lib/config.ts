import { resolveConfig as viteResolveConfig } from "vite";

import type { FrameworkConfig } from "../config.js";

export const configFileConfig = process.env.CONFIG_FILE
  ? { configFile: process.env.CONFIG_FILE }
  : {};

export async function resolveConfig(command: "build" | "serve") {
  const origConfig = await viteResolveConfig(configFileConfig, command);
  const framework: Required<FrameworkConfig> = {
    indexHtml: "index.html",
    entriesJs: "entries.js",
    outPublic: "public",
    rscPrefix: "RSC/",
    ...(origConfig as { framework?: FrameworkConfig }).framework,
  };
  const config = { ...origConfig, framework };
  return config;
}
