import type { MiddlewareCreator } from "./lib/common.js";

const notFound: MiddlewareCreator = () => async (_req, res) => {
  res.statusCode = 404;
  res.end();
};

export default notFound;
