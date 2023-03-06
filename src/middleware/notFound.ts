import type { MiddlewareCreator } from "./common.ts";

const notFound: MiddlewareCreator = () => async (_req, res) => {
  res.statusCode = 404;
  res.end();
};

export default notFound;
