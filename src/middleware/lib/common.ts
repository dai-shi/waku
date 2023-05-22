import type { Config, Middleware } from "../../config.js";

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
