import type { Middleware } from "../config";

export const notFound: Middleware = async (_config, _req, res) => {
  res.statusCode = 404;
  res.end();
};
