import type { Middleware } from "../config.js";

export const pipe =
  (middlewares: Middleware[]): Middleware =>
  (config, req, res, next) => {
    const run = async (index: number) => {
      const middleware = middlewares[index];
      if (!middleware) {
        return next();
      }
      let alreadyCalled = false;
      await middleware(config, req, res, async () => {
        if (!alreadyCalled) {
          alreadyCalled = true;
          await run(index + 1);
        }
      });
    };
    return run(0);
  };
