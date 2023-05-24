import type { ConfigEnv, UserConfig } from "vite";

export interface FrameworkConfig {
  indexHtml?: string; // relative to root
  entriesJs?: string; // relative to root
  outPublic?: string; // relative to build.outDir
  rscPrefix?: string; // defaults to "RSC/"
}

export interface ExtendedUserConfig extends UserConfig {
  framework?: FrameworkConfig;
}

export function defineConfig(
  config:
    | ExtendedUserConfig
    | Promise<ExtendedUserConfig>
    | ((env: ConfigEnv) => ExtendedUserConfig)
    | ((env: ConfigEnv) => Promise<ExtendedUserConfig>)
) {
  return config;
}
