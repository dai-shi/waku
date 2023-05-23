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

export type MiddlewareCreator = (config: Config) => Middleware;

export const pipe =
  (middlewares: Middleware[]): Middleware =>
  (req, res, next) => {
    const run = async (index: number) => {
      const middleware = middlewares[index];
      if (!middleware) {
        return next();
      }
      let alreadyCalled = false;
      await middleware(req, res, async () => {
        if (!alreadyCalled) {
          alreadyCalled = true;
          await run(index + 1);
        }
      });
    };
    return run(0);
  };
