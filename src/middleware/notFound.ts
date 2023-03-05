import type { Middleware } from "../config.ts";

const notFound: Middleware = async (_config, _req, res) => {
  res.statusCode = 404;
  res.end();
};

export default notFound;
