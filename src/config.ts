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

type PrdServer = {
  dir?: string;
  port?: number;
  middlewares?: (Middleware | string)[];
};

type Build = {
  dir?: string;
  basePath?: string;
};

type Files = {
  indexHtml?: string;
  entriesJs?: string;
  dist?: string;
  public?: string;
};

export type Config = {
  devServer?: DevServer;
  prdServer?: PrdServer;
  build?: Build;
  files?: Files;
};
