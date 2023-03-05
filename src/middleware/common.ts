import type { Middleware } from "../config";

export const pipe =
  (middleware: Middleware[]): Middleware =>
  (req, res, next) => {
    const run = async (index: number) => {
      if (index >= middleware.length) {
        return next();
      }
      let alreadyCalled = false;
      await middleware[index]!(req, res, async () => {
        if (!alreadyCalled) {
          alreadyCalled = true;
          await run(index + 1);
        }
      });
    };
    return run(0);
  };
