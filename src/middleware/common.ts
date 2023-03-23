import type { Config, Middleware } from "../config.js";

export type Shared = {
  devScriptToInject?: (path: string) => Promise<string>;
  prdScriptToInject?: (path: string) => Promise<string>;
};

export type MiddlewareCreator = (config: Config, shared: Shared) => Middleware;

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
