import http from "node:http";

export type Middleware = (
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  next: () => Promise<void>
) => Promise<void>;

type DevServer = {
  dir?: string;
  port?: number;
  middlewares?: (Middleware | string)[];
};

export type Config = {
  devServer?: DevServer;
};

export function defineConfig(config: Config): Config {
  return config;
}
