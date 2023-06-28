import type { ConfigEnv, UserConfig } from "vite";

export interface FrameworkConfig {
  indexHtml?: string; // relative to root
  entriesJs?: string; // relative to root
  outPublic?: string; // relative to build.outDir
  rscPrefix?: string; // defaults to "RSC/"
  ssr?: {
    rscServer?: string;
    splitHTML?: (htmlStr: string) => readonly [string, string, string];
    getFallback?: (id: string) => string;
  };
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

// internal function
export function setRootDir(root: string) {
  // FIXME it would be better to use a module variable or async local storage
  (globalThis as any).WAKU_CONFIG_ROOT_DIR = root;
}

// XXX this looks very hacky, not sure if we want to keep it in the future.
export function rootDir(): string {
  const resolvedRootDir = (globalThis as any).WAKU_CONFIG_ROOT_DIR;
  if (typeof resolvedRootDir !== "string") {
    throw new Error("rootDir() is called before resolved");
  }
  return resolvedRootDir;
}
