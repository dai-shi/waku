import http from "node:http";

export type Middleware = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => Promise<void>
) => Promise<void>;

type DevServer = {
  dir?: string;
  port?: number;
  middlewares?: (Middleware | string)[];
};

type Files = {
  indexHtml?: string;
  entries?: string;
}

export type Config = {
  devServer?: DevServer;
  files?: Files;
};

export function defineConfig(config: Config): Config {
  return config;
}
