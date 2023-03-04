export type DevServerConfig = {
  port?: number;
}

export type Config = {
  devServer?: DevServerConfig;
};

export function defineConfig(config: Config): Config {
  return config;
}
