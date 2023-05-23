import type { ConfigEnv, UserConfig } from "vite";

export interface FrameworkConfig {
  indexHtml?: string;
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
