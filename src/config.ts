export type Middleware = (
  config: Config,
  req: Request,
  res: Response,
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
