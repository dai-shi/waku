export type Middleware = (
  req: Request,
  res: Response,
  next: () => Promise<void>
) => Promise<void>;

type DevServerConfig = {
  dir?: string;
  port?: number;
  middleware?: (Middleware | string)[];
};

export type Config = {
  devServer?: DevServerConfig;
};

export function defineConfig(config: Config): Config {
  return config;
}
